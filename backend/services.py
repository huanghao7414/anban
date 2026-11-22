import base64
import binascii
import io
import os
import re
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError
from fastapi import HTTPException
from .store import new_id

LEGAL = "不替代执业医师诊断与处方调整"
REPORT_MEANING = "箭头表示这一项高于或低于这张报告给出的参考范围。判断原因，还需要医生结合您的身体情况和其他检查一起看。"
TIME_RE = re.compile(r"(?:[01]\d|2[0-3]):[0-5]\d")


def validate_med(m):
    if not m.get("name", "").strip() or not m.get("dose", "").strip() or not TIME_RE.fullmatch(m.get("time", "")):
        raise HTTPException(422, "请按医嘱核对药名、每次用量和每日时间。")
    if re.search(r"不清楚|忘了|不知道|不确定|记不清|可能|好像|隔天|隔日|每周|按需", m["name"] + m["dose"] + m.get("meal", "")):
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
    chunks = ["这是示例用药卡。" if card.get("demo") else "这是您核对的每日用药。"]
    for m in sorted(card["meds"], key=lambda m: m["time"]):
        h, minute = map(int, m["time"].split(":"))
        chunks.append(f"{h}点" + (f"{minute}分" if minute else "整") + f"，{m['name']}，每次{m['dose']}。" + (m["meal"] + "。" if m["meal"] else ""))
    return "".join(chunks)


def card_png(card):
    candidates = [os.getenv("ANBAN_FONT_PATH", ""), "/System/Library/Fonts/PingFang.ttc",
                  "/System/Library/Fonts/STHeiti Medium.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]
    fontpath = next((p for p in candidates if p and Path(p).is_file()), None)
    if not fontpath:
        raise HTTPException(503, "服务器需要配置 ANBAN_FONT_PATH 中文字体后才能生成 PNG。")
    rows = [("安伴 · 健康手记", 36), ("示例用药卡" if card["demo"] else (card.get("person") or "我") + "的用药卡", 62), (card["date"], 36)]
    for m in sorted(card["meds"], key=lambda m: m["time"]):
        rows.extend([(m["time"], 60), (m["name"], 58), ("每次 " + m["dose"], 48)])
        if m["meal"]:
            rows.append((m["meal"], 44))
    rows.append((LEGAL, 32))
    draw = ImageDraw.Draw(Image.new("RGB", (960, 10)))
    lines = []
    for text, size in rows:
        font = ImageFont.truetype(fontpath, size)
        line = ""
        for char in text:
            if line and draw.textlength(line + char, font=font) > 840:
                lines.append((line, font, size)); line = ""
            line += char
        lines.append((line, font, size))
    img = Image.new("RGB", (960, 90 + sum(int(size * 1.6) for _, _, size in lines)), "#fffefa")
    draw = ImageDraw.Draw(img); draw.rectangle((0, 0, 960, 15), fill="#315d72")
    y = 42
    for text, font, size in lines:
        draw.text((56, y), text, font=font, fill="#293f4c")
        y += int(size * 1.6)
    out = io.BytesIO(); img.save(out, "PNG"); return out.getvalue()


def local_audio(text):
    if os.getenv("ANBAN_TTS", "auto") == "browser" or not shutil.which("say"):
        return None
    try:
        # Fixed argv and local temp files; no shell interpolation or external voice downloads.
        with tempfile.TemporaryDirectory(prefix="anban-voice-") as tmp:
            src, out = Path(tmp) / "voice.txt", Path(tmp) / "voice.m4a"
            src.write_text(text, encoding="utf-8")
            subprocess.run(["/usr/bin/say", "-v", "Tingting", "-r", "190", "-f", str(src), "-o", str(out), "--file-format=m4af"],
                           check=True, capture_output=True, timeout=40)
            return out.read_bytes()
    except (OSError, subprocess.SubprocessError):
        return None


def next_occurrence(at, tz, now):
    local = datetime.fromtimestamp(now, ZoneInfo(tz))
    h, minute = map(int, at.split(":"))
    candidate = local.replace(hour=h, minute=minute, second=0, microsecond=0)
    if candidate.timestamp() <= now:
        candidate += timedelta(days=1)
    return candidate.timestamp()


def collect_due(store, now=None):
    now = now if now is not None else time.time()
    with store.db() as db:
        db.execute("BEGIN IMMEDIATE")
        for row in db.execute("SELECT * FROM reminders WHERE enabled=1 AND next_at<=?", (now,)).fetchall():
            # At most the latest 24h is surfaced after a long offline period; never backfill doses.
            at = row["next_at"]
            if at < now - 86400:
                at = next_occurrence(row["at"], row["timezone"], now - 86400)
            if at <= now:
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
