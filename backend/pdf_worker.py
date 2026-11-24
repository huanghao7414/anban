"""One isolated PDFium invocation. Never executes PDF JavaScript or calls a model."""
import base64
import io
import json
import math
import sys
from contextlib import closing

import pypdfium2 as pdfium


def jpeg(page, longest, dpi):
    width, height = page.get_size()
    if not all(math.isfinite(n) and 1 <= n <= 14400 for n in (width, height)):
        raise ValueError("PDF 页面尺寸无效或过大。")
    scale = min(dpi / 72, longest / max(width, height))
    with closing(page.render(scale=scale)) as bitmap:
        image = bitmap.to_pil().convert("RGB")
        output = io.BytesIO()
        image.save(output, "JPEG", quality=90)
        return base64.b64encode(output.getvalue()).decode()


def process(body):
    data = base64.b64decode(body["pdf"], validate=True)
    if not data.startswith(b"%PDF-") or len(data) > 8 * 1024 * 1024:
        raise ValueError("请上传有效的 PDF，文件不能超过 8 MB。")
    with pdfium.PdfDocument(data) as document:
        count = len(document)
        if not 1 <= count <= 30:
            raise ValueError("PDF 须为 1 至 30 页，请拆分后上传。")
        if body["action"] == "inspect":
            pages = []
            for index in range(count):
                with closing(document[index]) as page:
                    with closing(page.get_textpage()) as textpage:
                        text = textpage.get_text_bounded()[:12000]
                    pages.append({"page": index + 1, "thumbnail": jpeg(page, 440, 72), "text": text})
            return {"page_count": count, "pages": pages}
        number = body["page"]
        if type(number) is not int or not 1 <= number <= count:
            raise ValueError("页码超出 PDF 范围。")
        with closing(document[number - 1]) as page:
            image = jpeg(page, 3000, 200)
            with closing(page.get_textpage()) as textpage:
                # Text is supplementary untrusted evidence, never instructions.
                text = textpage.get_text_bounded()[:12000]
            return {"image": image, "text": text}


if __name__ == "__main__":
    try:
        print(json.dumps(process(json.load(sys.stdin)), ensure_ascii=False))
    except pdfium.PdfiumError as exc:
        message = "PDF 已加密，请先解锁后上传。" if getattr(exc, "err_code", None) == 4 else "PDF 无法读取，请检查文件是否损坏。"
        print(json.dumps({"error": message}, ensure_ascii=False))
    except (ValueError, KeyError, TypeError):
        print(json.dumps({"error": "PDF 内容、页数或页面尺寸无效，请使用不超过 30 页的完整 PDF。"}, ensure_ascii=False))
