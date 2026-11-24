"""Render a user-confirmed daily schedule; no model, network, or dose calculation."""
import argparse
from datetime import date
import io
import json
from pathlib import Path
import re
import unicodedata


LEGAL = "不替代执业医师诊断与处方调整"


DOSE_UNIT_MESSAGE = "请填写每次用量及单位，例如 2 粒、1 片或 5 mL。"
BARE_DOSE = re.compile(r"(?:每次|一次)?[\d零〇一二两三四五六七八九十百半./~～至到—–-]+")


def dose_needs_unit(dose):
    normalized = "".join(unicodedata.normalize("NFKC", dose).split())
    return bool(BARE_DOSE.fullmatch(normalized))


def dose_label(dose):
    if dose_needs_unit(dose):
        return f"每次用量：{dose}（单位待核对）"
    spaced = re.sub(r"(?<=\d)(?=[片粒颗袋包丸滴支喷揿贴勺克毫微瓶枚锭a-zA-Z])", " ", dose)
    return "每次用量：" + spaced


def clean_text(value, label, limit=120, allow_empty=False):
    if not isinstance(value, str) or len(value) > limit or (not allow_empty and not value.strip()):
        raise ValueError(label + "缺失或过长")
    if any(ord(ch) < 32 for ch in value):
        raise ValueError(label + "不能包含控制字符")
    return value


def validate(data):
    if not isinstance(data, dict) or data.get("daily") is not True:
        raise ValueError("只支持已确认的每日固定安排")
    person = clean_text(data.get("person", ""), "称呼", 40, True)
    stamp = clean_text(data.get("date"), "制卡日期", 10)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", stamp):
        raise ValueError("制卡日期必须为 YYYY-MM-DD")
    date.fromisoformat(stamp)
    if not isinstance(data.get("demo", False), bool):
        raise ValueError("demo 必须为布尔值")
    raw = data.get("medications")
    if not isinstance(raw, list) or not 1 <= len(raw) <= 5:
        raise ValueError("请提供 1 至 5 盒药的已核对记录")
    meds = []
    for row in raw:
        if not isinstance(row, dict) or row.get("confirmed") is not True:
            raise ValueError("每盒药都需要用户明确确认")
        name = clean_text(row.get("name"), "药名")
        food = clean_text(row.get("food_notes", ""), "食物注意", allow_empty=True)
        extra = row.get("extra_doses", [])
        if not isinstance(extra, list) or len(extra) > 2:
            raise ValueError("每盒最多支持三个每日时点")
        times = set()
        for dose in [row, *extra]:
            if not isinstance(dose, dict):
                raise ValueError("服用安排格式有误")
            item = {k: clean_text(dose.get(k, ""), k, allow_empty=k == "meal")
                    for k in ("dose", "time", "meal")}
            item.update(name=name, food_notes=food)
            if dose_needs_unit(item["dose"]):
                raise ValueError(DOSE_UNIT_MESSAGE)
            if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", item["time"]):
                raise ValueError("每日时间必须为有效的 HH:MM")
            if item["time"] in times:
                raise ValueError("同一盒药的服用时间不能重复")
            times.add(item["time"])
            if re.search(r"不清楚|忘了|不知道|不确定|记不清|可能|好像|隔天|隔日|每周|按需", " ".join(item.values())):
                raise ValueError("存在待核对内容或此模板不支持的服法")
            meds.append(item)
    return {"person": person, "date": stamp, "demo": data.get("demo", False),
            "medications": sorted(meds, key=lambda m: m["time"])}


def narration(card):
    prefix = "这是虚构示例，不能作为实际用药安排。" if card["demo"] else "这是您核对的每日用药安排。"
    rows = []
    for m in card["medications"]:
        hour, minute = map(int, m["time"].split(":"))
        when = str(hour) + "点" + (str(minute) + "分" if minute else "整")
        rows.append(when + "，" + m["name"] + "，每次" + m["dose"] + "。" + (m["meal"] + "。" if m["meal"] else "") + ("食物注意：" + m["food_notes"] + "。" if m["food_notes"] else ""))
    return prefix + "".join(rows) + LEGAL + "。"


def render(card, font_path):
    title = "示例每日用药卡" if card["demo"] else (card["person"] or "我") + "的每日用药卡"
    return render_medication_card(card["medications"], title, card["date"], LEGAL, font_path)


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
        top = y
        block = len(operations)
        text(label, 71, y + 28, 56, accent, 68, True)
        y += 24
        if not scheduled:
            y = text("未登记用药", 190, y + 12, 36, muted, 680) + 17
        for index, med in enumerate(scheduled):
            if index:
                box((189, y + 3, 877, y + 5), 1, "#DDE4E4")
                y += 24
            text(med["time"], 190, y, 52, accent, 212, True)
            right = text(med["name"], 410, y + 2, 52, ink, 462, True)
            right = text(dose_label(med["dose"]), 410, right + 3, 40, ink, 462)
            y = max(y + 66, right)
            if med.get("meal"):
                y = text(med["meal"], 190, y + 7, 38, ink, 686)
            else:
                y = text("用餐关系未登记", 190, y + 7, 35, muted, 686)
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


def main():
    cli = argparse.ArgumentParser(description="从已确认的每日安排生成大字 PNG 和朗读稿")
    cli.add_argument("input", type=Path)
    cli.add_argument("--out", required=True, type=Path)
    cli.add_argument("--font", type=Path)
    args = cli.parse_args()
    try:
        card = validate(json.loads(args.input.read_text(encoding="utf-8")))
        fonts = [args.font] if args.font else [Path(p) for p in (
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/STHeiti Medium.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "C:/Windows/Fonts/msyh.ttc")]
        font = next((p for p in fonts if p.is_file()), None)
        if font is None:
            raise ValueError("未找到中文字体，请通过 --font 指定字体文件")
        image = render(card, font)
        targets = [args.out / "medication-card.png", args.out / "narration.txt"]
        if any(p.exists() for p in targets):
            raise ValueError("输出已存在，请选择新的输出目录")
        args.out.mkdir(parents=True, exist_ok=True)
        with targets[0].open("xb") as stream:
            stream.write(image)
        with targets[1].open("x", encoding="utf-8") as stream:
            stream.write(narration(card) + "\n")
        for path in targets:
            print(path.resolve())
    except (ValueError, OSError, ImportError) as error:
        cli.exit(1, "未生成卡片：" + str(error) + "\n")


if __name__ == "__main__":
    main()
