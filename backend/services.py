import base64
import binascii
import io
import os
import re
import shutil
import subprocess
import tempfile
import time
import unicodedata
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import HTTPException
from .store import new_id

LEGAL = "不替代执业医师诊断与处方调整"
REPORT_MEANING = "箭头表示这一项高于或低于这张报告给出的参考范围。判断原因，还需要医生结合您的身体情况和其他检查一起看。"
TIME_RE = re.compile(r"(?:[01]\d|2[0-3]):[0-5]\d")


DOSE_UNIT_MESSAGE = "请填写每次用量及单位，例如 2 粒、1 片或 5 mL。"
DOSE_REVIEW_SPEECH = "这张用药卡有用量缺少单位，请对照药袋或医嘱重新核对后再使用。"
BARE_DOSE = re.compile(r"(?:每次|一次)?[\d零〇一二两三四五六七八九十百半./~～至到—–-]+")


def dose_needs_unit(dose):
    normalized = "".join(unicodedata.normalize("NFKC", dose).split())
    return bool(BARE_DOSE.fullmatch(normalized))


def dose_label(dose):
    if dose_needs_unit(dose):
        return f"每次用量待核对（原填：{dose}，缺单位）"
    spaced = re.sub(r"(?<=\d)(?=[片粒颗袋包丸滴支喷揿贴勺克毫微瓶枚锭a-zA-Z])", " ", dose)
    return "每次用量：" + spaced


def doses(med):
    first = {key: med[key] for key in ("dose", "time", "meal")}
    return [
        {**item, "name": med["name"], "food_notes": med.get("food_notes", "")}
        for item in [first, *med.get("extra_doses", [])]
    ]


def validate_med(m):
    administrations = doses(m)
    if len({item["time"] for item in administrations}) != len(administrations):
        raise HTTPException(422, "同一盒药的服用时间不能重复。")
    for item in administrations:
        validate_dose(item)


def validate_dose(m):
    if not m.get("name", "").strip() or not m.get("dose", "").strip() or not TIME_RE.fullmatch(m.get("time", "")):
        raise HTTPException(422, "请按医嘱核对药名、每次用量和每日时间。")
    if dose_needs_unit(m["dose"]):
        raise HTTPException(422, DOSE_UNIT_MESSAGE)
    if re.search(r"不清楚|忘了|不知道|不确定|记不清|可能|好像|隔天|隔日|每周|按需", m["name"] + m["dose"] + m.get("meal", "") + m.get("food_notes", "")):
        raise HTTPException(422, "每日吃法尚未确定，请先核对医嘱。")


def decode_photo(url):
    if not url.startswith(("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,", "data:image/gif;base64,")):
        raise HTTPException(422, "请上传 JPG、PNG、WebP 或 GIF 图片。")
    try:
        data = base64.b64decode(url.split(",", 1)[1], validate=True)
        if not data or len(data) > 8 * 1024 * 1024:
            raise HTTPException(413, "照片不能超过 8 MB。")
        with Image.open(io.BytesIO(data)) as original:
            if original.format not in {"JPEG", "PNG", "WEBP", "GIF"} or original.width * original.height > 25_000_000:
                raise ValueError()
            original.load()
            image = ImageOps.exif_transpose(original).convert("RGB")
            image.thumbnail((2000, 2000))
            out = io.BytesIO()
            image.save(out, "JPEG", quality=85)
            return out.getvalue()
    except (binascii.Error, ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError):
        raise HTTPException(422, "图片无效或尺寸过大，请换一张照片。")


def narration(card):
    if any(dose_needs_unit(m["dose"]) for m in card["meds"]):
        return DOSE_REVIEW_SPEECH
    chunks = ["这是示例用药卡。" if card.get("demo") else "这是您核对的每日用药。"]
    for m in sorted(card["meds"], key=lambda m: m["time"]):
        h, minute = map(int, m["time"].split(":"))
        chunks.append(f"{h}点" + (f"{minute}分" if minute else "整") + f"，{m['name']}，每次{m['dose']}。" + (m["meal"] + "。" if m["meal"] else ""))
    text = "".join(chunks)
    if len(text) > 110:
        return chunks[0] + "具体的药名、用量、饭前饭后和食物注意事项，请按已核对的大字卡查看。"
    return text + ("食物注意事项请看大字卡。" if any(m.get("food_notes") for m in card["meds"]) else "")


def card_png(card):
    candidates = [os.getenv("ANBAN_FONT_PATH", ""), "/System/Library/Fonts/PingFang.ttc",
                  "C:/Windows/Fonts/msyh.ttc", "/System/Library/Fonts/STHeiti Medium.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]
    fontpath = next((p for p in candidates if p and Path(p).is_file()), None)
    if not fontpath:
        raise HTTPException(503, "服务器需要配置 ANBAN_FONT_PATH 中文字体后才能生成 PNG。")
    title = "示例每日用药卡" if card["demo"] else (card.get("person") or "我") + "的每日用药卡"
    date_label = card["date"]
    if card.get("start_date"):
        date_label = f'{card["start_date"]} 至 {card["end_date"]}' if card.get("end_date") else f'{card["start_date"]} 起'
    return render_medication_card(card["meds"], title, date_label, LEGAL, fontpath)


def render_medication_card(meds, title, date, legal, font_path):
    from PIL import Image, ImageDraw, ImageFont

    width = 960
    ink, muted = "#182E36", "#435963"
    periods = (
        ("早", "00:00", "11:00", "#FAE8CA", "#75471B"),
        ("中", "11:00", "17:00", "#DFEDE2", "#255844"),
        ("晚", "17:00", "24:00", "#E6E9F4", "#414C75"),
    )
    probe = ImageDraw.Draw(Image.new("RGB", (width, 1)))
    fonts = {}

    def wrap(text, size, available):
        if size not in fonts:
            fonts[size] = ImageFont.truetype(str(font_path), size)
        font = fonts[size]
        lines, line = [], ""
        for char in text:
            if line and probe.textlength(line + char, font=font) > available:
                lines.append(line)
                line = ""
            line += char
        return [*lines, line]

    operations = []

    def box(coords, radius, color):
        operations.append(("box", coords, radius, color))

    def text(value, x, y, size, color, available, weight=False):
        for line in wrap(value, size, available):
            operations.append(("text", (x, y), (line, size, weight), color))
            y += round(size * 1.23)
        return y

    y = text(title, 76, 66, 67, "#FFFFFF", 808, True)
    y = text(date, 78, y + 13, 35, "#D5E8E5", 804) + 50
    operations.insert(0, ("box", (42, 36, 918, y - 22), 34, "#143E43"))
    for label, start, end, tint, accent in periods:
        scheduled = sorted((med for med in meds if start <= med["time"] < end),
                           key=lambda med: med["time"])
        if not scheduled:
            continue
        top = y
        block = len(operations)
        text(label, 71, y + 28, 56, accent, 68, True)
        y += 24
        for index, med in enumerate(scheduled):
            if index:
                box((189, y + 3, 877, y + 5), 1, "#DDE4E4")
                y += 24
            text(med["time"], 190, y, 52, accent, 212, True)
            right = text(med["name"], 410, y + 2, 52, ink, 462, True)
            right = text(dose_label(med["dose"]), 410, right + 3, 45,
                         "#8A441E" if dose_needs_unit(med["dose"]) else "#143E43", 462, True)
            y = max(y + 66, right)
            if med.get("meal"):
                y = text(med["meal"], 190, y + 7, 38, ink, 686)
            if med.get("food_notes"):
                y = text("食物注意：" + med["food_notes"], 190, y + 6, 35, ink, 686)
            y += 12
        y += 16
        operations[block:block] = [
            ("box", (42, top, 918, y), 30, "#FFFFFF"),
            ("box", (54, top + 12, 160, y - 12), 24, tint),
        ]
        y += 18
    y = text(legal, 68, y + 8, 31, muted, 824) + 44
    image = Image.new("RGB", (width, y), "#EEF2F0")
    draw = ImageDraw.Draw(image)
    for kind, coords, payload, color in operations:
        if kind == "box":
            draw.rounded_rectangle(coords, radius=payload, fill=color)
        else:
            value, size, weight = payload
            draw.text(coords, value, font=fonts[size], fill=color, anchor="lt",
                      stroke_width=int(weight), stroke_fill=color)
    output = io.BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


def local_audio(text):
    if os.getenv("ANBAN_TTS", "auto") == "browser":
        return None
    try:
        with tempfile.TemporaryDirectory(prefix="anban-voice-") as tmp:
            src, out = Path(tmp) / "voice.txt", Path(tmp) / "voice.wav"
            src.write_text(text, encoding="utf-8")
            if os.name == "nt":
                script = """
$ErrorActionPreference = 'Stop'
$voice = New-Object -ComObject SAPI.SpVoice
$chinese = $voice.GetVoices('Language=804')
if ($chinese.Count -eq 0) { exit 1 }
$voice.Voice = $chinese.Item(0)
$stream = New-Object -ComObject SAPI.SpFileStream
$stream.Open((Join-Path $PWD 'voice.wav'), 3)
try {
    $voice.AudioOutputStream = $stream
    $null = $voice.Speak([IO.File]::ReadAllText((Join-Path $PWD 'voice.txt')), 16)
} finally {
    $stream.Close()
}
"""
                subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                               cwd=tmp, check=True, capture_output=True, timeout=40)
            elif shutil.which("say") and shutil.which("afconvert"):
                aiff = Path(tmp) / "voice.aiff"
                subprocess.run(["say", "-v", "Tingting", "-r", "190", "-f", str(src), "-o", str(aiff)],
                               check=True, capture_output=True, timeout=40)
                subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16", str(aiff), str(out)],
                               check=True, capture_output=True, timeout=10)
            else:
                return None
            with wave.open(str(out), "rb") as wav:
                if not 0 < wav.getnframes() < 60 * wav.getframerate():
                    return None
            return out.read_bytes()
    except (OSError, subprocess.SubprocessError, EOFError, wave.Error):
        return None


def next_occurrence(at, tz, now):
    local = datetime.fromtimestamp(now, ZoneInfo(tz))
    h, minute = map(int, at.split(":"))
    candidate = local.replace(hour=h, minute=minute, second=0, microsecond=0)
    if candidate.timestamp() <= now:
        candidate += timedelta(days=1)
    return candidate.timestamp()


REMINDER_WINDOW = 300


def collect_due(store, now=None):
    now = now if now is not None else time.time()
    with store.db() as db:
        db.execute("BEGIN IMMEDIATE")
        for row in db.execute("SELECT * FROM reminders WHERE enabled=1 AND next_at<=?", (now,)).fetchall():
            at = row["next_at"]
            if now - REMINDER_WINDOW <= at <= now:
                db.execute("INSERT OR IGNORE INTO reminder_events VALUES(?,?,?,?,0)", (new_id(), row["id"], row["user_id"], at))
            db.execute("UPDATE reminders SET next_at=? WHERE id=?", (next_occurrence(row["at"], row["timezone"], now), row["id"]))


def calendar_ics(rows):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Anban//Daily Medication//ZH-CN", "CALSCALE:GREGORIAN"]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for row in rows:
        when = datetime.fromtimestamp(row["next_at"], ZoneInfo(row["timezone"])).strftime("%Y%m%dT%H%M%S")
        lines += ["BEGIN:VEVENT", "UID:" + row["id"] + "@anban.local", "DTSTAMP:" + stamp,
                  f"DTSTART;TZID={row['timezone']}:{when}", "DURATION:PT1M", "RRULE:FREQ=DAILY", "SUMMARY:查看安伴用药卡",
                  "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:PT0M", "DESCRIPTION:查看已核对的用药卡", "END:VALARM", "END:VEVENT"]
    return "\r\n".join(lines + ["END:VCALENDAR", ""])
