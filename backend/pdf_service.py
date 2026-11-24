"""Bounded PDF parsing and source-aware, page-by-page ingestion."""
import base64
import binascii
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

from fastapi import Depends, HTTPException, Request, Response

from .models import PDFSelection, PDFUpload, ReportRequest
from .services import LEGAL, REPORT_MEANING
from .store import dump, new_id

ROOT = Path(__file__).resolve().parents[1]
PDF_WORKERS = threading.BoundedSemaphore(2)


def pdf_call(data, action, page=None):
    if not PDF_WORKERS.acquire(timeout=2):
        raise HTTPException(503, "正在处理其他 PDF，请稍后重试。")
    try:
        # The native parser has no need for application/model credentials.
        allowed = {"PATH", "LANG", "LC_ALL", "SystemRoot", "SYSTEMROOT", "TMPDIR", "TMP", "TEMP", "FONTCONFIG_PATH", "FONTCONFIG_FILE"}
        result = subprocess.run([sys.executable, "-m", "backend.pdf_worker"], cwd=ROOT,
                                input=dump({"pdf": base64.b64encode(data).decode(), "action": action, "page": page}),
                                text=True, encoding="utf-8", env={**{k: v for k, v in os.environ.items() if k in allowed}, "PYTHONIOENCODING": "utf-8"}, capture_output=True, timeout=30)
        value = json.loads(result.stdout) if result.returncode == 0 else {}
        if value.get("error"):
            raise HTTPException(422, value["error"])
        if not value or (action == "inspect" and not value.get("pages")) or (action == "render" and not value.get("image")):
            raise HTTPException(422, "PDF 无法处理，请换一份文件。")
        return value
    except subprocess.TimeoutExpired:
        raise HTTPException(422, "PDF 处理超时，请减少页数或换一份文件。")
    except (ValueError, OSError):
        raise HTTPException(422, "PDF 无法处理，请换一份文件。")
    finally:
        PDF_WORKERS.release()


def pdf_source(db, upload_id):
    row = db.execute("SELECT d.id,d.filename,p.page FROM pdf_pages p JOIN pdf_documents d ON d.id=p.document_id WHERE p.upload_id=?", (upload_id,)).fetchone()
    return {"document_id": row["id"], "filename": row["filename"], "page": row["page"],
            "image_url": f"/api/v1/uploads/{upload_id}/image"} if row else None


def linked_draft(db, document_id):
    # A selected document is immutable once it has entered a medication draft.
    document = db.execute("SELECT user_id FROM pdf_documents WHERE id=?", (document_id,)).fetchone()
    for row in db.execute("SELECT id,data FROM drafts WHERE user_id=?", (document["user_id"],)):
        if any(m.get("document_id") == document_id for m in json.loads(row["data"])["meds"]):
            return row["id"]
    return None


def document_view(db, doc):
    selected = json.loads(doc["selected"])
    pages = []
    for row in db.execute("SELECT p.*,u.analysis FROM pdf_pages p LEFT JOIN uploads u ON u.id=p.upload_id WHERE document_id=? ORDER BY page", (doc["id"],)):
        result = json.loads(row["analysis"]) if row["analysis"] else None
        pages.append({"page": row["page"], "selected": row["page"] in selected, "upload_id": row["upload_id"],
                      "preview_url": f"/api/v1/documents/{doc['id']}/pages/{row['page']}/preview",
                      "image_url": f"/api/v1/documents/{doc['id']}/pages/{row['page']}/image",
                      "result": result, "error": row["error"],
                      **({"search_text": row["text"]} if doc["kind"] == "report" else {})})
    return {"id": doc["id"], "kind": doc["kind"], "filename": doc["filename"], "page_count": doc["page_count"],
            "selected": selected, "pages": pages, "attached_draft_id": linked_draft(db, doc["id"]) if doc["kind"] == "medicine" else None,
            "created": doc["created"], "updated": doc["updated"]}


def report_view(document):
    pages = [p for p in document["pages"] if p["selected"]]
    rows = [{**r, "page": p["page"]} for p in pages for r in (p["result"] or {}).get("fields", {}).get("indicators", [])]
    return {"id": document["id"], "document_id": document["id"], "filename": document["filename"],
            "status": "needs_confirmation" if rows else "manual_required", "pages": pages,
            "fields": {"indicators": rows, "unreadable": any(p["error"] or not p["result"] or p["result"].get("fields", {}).get("unreadable", True) for p in pages)},
            "explanation": REPORT_MEANING if rows else "", "legal": LEGAL,
            "source": "https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/", "created": document["updated"]}


def medication_view(document):
    pages = [p for p in document["pages"] if p["selected"]]
    if not pages or any(not p["result"] or p["error"] for p in pages):
        raise HTTPException(409, "请先完成所选说明书页的识别，失败页可以重试或取消选择。")
    fields, conflicts = {}, []
    for key in ("name", "specification", "manufacturer"):
        values = list(dict.fromkeys(p["result"].get("fields", {}).get(key, "").strip() for p in pages))
        values = [v for v in values if v]
        fields[key] = values[0] if len(values) == 1 else ""
        if len(values) > 1:
            conflicts.append(key)
    if "name" in conflicts:
        raise HTTPException(422, "所选页面出现不同药名，请只选择同一种药的说明书页。")
    fields["label_directions"] = "\n".join(f"第 {p['page']} 页：{p['result']['fields']['label_directions']}" for p in pages if p["result"].get("fields", {}).get("label_directions"))[:5000]
    fields["uncertain"] = bool(conflicts) or any(p["result"].get("fields", {}).get("uncertain", True) for p in pages)
    result = {"status": "needs_confirmation", "fields": fields}
    if fields["uncertain"]:
        result["reason"] = "说明书存在看不清或不一致的内容，请对照原页核对。"
    return result, pages


def register_pdf_routes(app, store, current, limit, analyze, report, locks):
    def owned(document_id, auth):
        with store.db() as db:
            return store.owned(db, "pdf_documents", document_id, auth["user_id"])

    def get_view(document_id, auth):
        with store.db() as db:
            return document_view(db, store.owned(db, "pdf_documents", document_id, auth["user_id"]))

    def page_image(document_id, number, auth):
        doc = owned(document_id, auth)
        with locks["pdf-image:" + document_id + ":" + str(number)]:
            with store.db() as db:
                row = db.execute("SELECT * FROM pdf_pages WHERE document_id=? AND page=?", (document_id, number)).fetchone()
                if not row:
                    raise HTTPException(404, "PDF 页码不存在。")
            if row["image"]:
                return bytes(row["image"]), row["text"]
            result = pdf_call(bytes(doc["content"]), "render", number)
            image = base64.b64decode(result["image"])
            with store.db() as db:
                db.execute("UPDATE pdf_pages SET image=?,text=? WHERE document_id=? AND page=?", (image, result["text"], document_id, number))
            return image, result["text"]

    @app.post("/api/v1/documents", tags=["PDF"])
    def upload_pdf(body: PDFUpload, request: Request, auth=Depends(current)):
        limit(request, "pdf-upload", 10)
        try:
            if not body.data_url.startswith("data:application/pdf;base64,"):
                raise ValueError()
            data = base64.b64decode(body.data_url.split(",", 1)[1], validate=True)
        except (ValueError, binascii.Error):
            raise HTTPException(422, "请上传 PDF 文件。")
        if not data or len(data) > 8 * 1024 * 1024:
            raise HTTPException(413, "PDF 不能超过 8 MB。")
        manifest = pdf_call(data, "inspect")
        did, now = new_id(), time.time()
        filename = body.filename.replace("\\", "/").rsplit("/", 1)[-1]
        with store.db() as db:
            db.execute("BEGIN IMMEDIATE")
            usage = db.execute("SELECT count(*),coalesce(sum(length(content)),0) FROM pdf_documents WHERE user_id=?", (auth["user_id"],)).fetchone()
            if usage[0] >= 50 or usage[1] + len(data) > 100 * 1024 * 1024:
                raise HTTPException(409, "PDF 已达到本地存储上限。")
            db.execute("INSERT INTO pdf_documents VALUES(?,?,?,?,?,?,'[]',?,?)", (did, auth["user_id"], body.kind, filename, data, manifest["page_count"], now, now))
            db.executemany("INSERT INTO pdf_pages(document_id,page,thumbnail,text) VALUES(?,?,?,?)",
                           [(did, p["page"], base64.b64decode(p["thumbnail"]), p.get("text", "")) for p in manifest["pages"]])
        return get_view(did, auth)

    @app.get("/api/v1/documents", tags=["PDF"])
    def documents(auth=Depends(current)):
        with store.db() as db:
            return {"items": [document_view(db, d) for d in db.execute("SELECT * FROM pdf_documents WHERE user_id=? ORDER BY updated DESC LIMIT 20", (auth["user_id"],)).fetchall()]}

    @app.get("/api/v1/documents/{document_id}", tags=["PDF"])
    def document(document_id: str, auth=Depends(current)):
        return get_view(document_id, auth)

    @app.put("/api/v1/documents/{document_id}/selection", tags=["PDF"])
    def select_pages(document_id: str, body: PDFSelection, auth=Depends(current)):
        with locks["pdf:" + document_id], store.db() as db:
            doc = store.owned(db, "pdf_documents", document_id, auth["user_id"])
            if max(body.pages) > doc["page_count"]:
                raise HTTPException(422, "所选页码超出 PDF 范围。")
            if linked_draft(db, document_id) and json.loads(doc["selected"]) != body.pages:
                raise HTTPException(409, "这份说明书已加入核对，请重新上传后选择其他页。")
            db.execute("UPDATE pdf_documents SET selected=?,updated=? WHERE id=?", (dump(body.pages), time.time(), document_id))
        return get_view(document_id, auth)

    @app.get("/api/v1/documents/{document_id}/pages/{number}/preview", tags=["PDF"])
    def preview(document_id: str, number: int, auth=Depends(current)):
        owned(document_id, auth)
        with store.db() as db:
            row = db.execute("SELECT thumbnail FROM pdf_pages WHERE document_id=? AND page=?", (document_id, number)).fetchone()
            if not row:
                raise HTTPException(404, "PDF 页码不存在。")
        return Response(bytes(row[0]), media_type="image/jpeg")

    @app.get("/api/v1/documents/{document_id}/pages/{number}/image", tags=["PDF"])
    def full_image(document_id: str, number: int, auth=Depends(current)):
        image, _ = page_image(document_id, number, auth)
        return Response(image, media_type="image/jpeg")

    @app.post("/api/v1/documents/{document_id}/pages/{number}/analyze", tags=["PDF"])
    def analyze_page(document_id: str, number: int, request: Request, auth=Depends(current)):
        with locks["pdf:" + document_id]:
            doc = owned(document_id, auth)
            if number not in json.loads(doc["selected"]):
                raise HTTPException(422, "请先选择需要识别的页面。")
            try:
                image, _ = page_image(document_id, number, auth)
                with store.db() as db:
                    row = db.execute("SELECT upload_id FROM pdf_pages WHERE document_id=? AND page=?", (document_id, number)).fetchone()
                    upload_id = row[0]
                    if not upload_id:
                        if db.execute("SELECT count(*) FROM uploads WHERE user_id=?", (auth["user_id"],)).fetchone()[0] >= 200:
                            raise HTTPException(409, "图片数量已达到本地上限。")
                        upload_id = new_id()
                        db.execute("INSERT INTO uploads VALUES(?,?,?,?,NULL,?)", (upload_id, auth["user_id"], doc["kind"], image, time.time()))
                        db.execute("UPDATE pdf_pages SET upload_id=? WHERE document_id=? AND page=?", (upload_id, document_id, number))
                if doc["kind"] == "report":
                    report(ReportRequest(upload_id=upload_id), request, auth)
                else:
                    analyze(upload_id, request, auth)
                with store.db() as db:
                    db.execute("UPDATE pdf_pages SET error=NULL WHERE document_id=? AND page=?", (document_id, number))
                    db.execute("UPDATE pdf_documents SET updated=? WHERE id=?", (time.time(), document_id))
            except HTTPException as exc:
                with store.db() as db:
                    db.execute("UPDATE pdf_pages SET error=? WHERE document_id=? AND page=?", (str(exc.detail), document_id, number))
                raise
        return get_view(document_id, auth)

    @app.post("/api/v1/drafts/{draft_id}/documents/{document_id}", tags=["用药核对"])
    def attach_document(draft_id: str, document_id: str, auth=Depends(current)):
        with locks["pdf:" + document_id], store.db() as db:
            db.execute("BEGIN IMMEDIATE")
            doc = store.owned(db, "pdf_documents", document_id, auth["user_id"])
            draft = store.draft(store.owned(db, "drafts", draft_id, auth["user_id"]))
            if doc["kind"] != "medicine" or draft["demo"] or draft["phase"] != "photos":
                raise HTTPException(409, "当前草稿不能添加这份说明书。")
            if any(m.get("document_id") == document_id for m in draft["meds"]):
                return draft
            if len(draft["meds"]) >= 5:
                raise HTTPException(422, "一次最多核对五种药。")
            recognition, pages = medication_view(document_view(db, doc))
            draft["meds"].append({"id": new_id(), "name": recognition["fields"]["name"][:80], "dose": "", "time": "", "meal": "", "ok": False,
                                  "document_id": document_id, "photo": pages[0]["image_url"], "recognition": recognition,
                                  "sources": [{"page": p["page"], "filename": doc["filename"], "image_url": p["image_url"]} for p in pages]})
            draft["revision"] += 1
            db.execute("UPDATE drafts SET data=?,revision=?,updated=? WHERE id=?", (dump(draft), draft["revision"], time.time(), draft_id))
            return draft
