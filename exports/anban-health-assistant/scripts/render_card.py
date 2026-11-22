"""Render a user-confirmed daily schedule; no model, network, or dose calculation."""
import argparse
from datetime import date
import io
import json
from pathlib import Path
import re


LEGAL = "不替代执业医师诊断与处方调整"


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
    if not isinstance(raw, list) or not 2 <= len(raw) <= 5:
        raise ValueError("请提供 2 至 5 盒药的已核对记录")
    meds = []
    for row in raw:
        if not isinstance(row, dict) or row.get("confirmed") is not True:
            raise ValueError("每盒药都需要用户明确确认")
        item = {k: clean_text(row.get(k, ""), k, allow_empty=k == "meal")
                for k in ("name", "dose", "time", "meal")}
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", item["time"]):
            raise ValueError("每日时间必须为有效的 HH:MM")
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
        rows.append(when + "，" + m["name"] + "，每次" + m["dose"] + "。" + (m["meal"] + "。" if m["meal"] else ""))
    return prefix + "".join(rows) + LEGAL + "。"


def render(card, font_path):
    from PIL import Image, ImageDraw, ImageFont
    title = "示例每日用药卡" if card["demo"] else (card["person"] or "我") + "的每日用药卡"
    rows = [(title, 62), (card["date"], 40)]
    for m in card["medications"]:
        rows.extend([(m["time"], 62), (m["name"], 58), ("每次 " + m["dose"], 50)])
        if m["meal"]:
            rows.append((m["meal"], 46))
    rows.append((LEGAL, 38))
    probe = ImageDraw.Draw(Image.new("RGB", (960, 10)))
    lines = []
    for text, size in rows:
        font = ImageFont.truetype(str(font_path), size)
        line = ""
        for char in text:
            if line and probe.textlength(line + char, font=font) > 840:
                lines.append((line, font, size)); line = ""
            line += char
        lines.append((line, font, size))
    image = Image.new("RGB", (960, 100 + sum(int(s * 1.65) for _, _, s in lines)), "#fffefa")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 959, 15), fill="#315d72")
    y = 48
    for text, font, size in lines:
        draw.text((56, y), text, font=font, fill="#243d4c")
        y += int(size * 1.65)
    output = io.BytesIO(); image.save(output, "PNG")
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
