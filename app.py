"""Local, read-only HTTP interface and catalog maintenance CLI."""
import argparse
import json
import sqlite3
import sys
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import knowledge as kb

ASSETS = {"/": ("index.html", "text/html"), "/app.js": ("app.js", "text/javascript"),
          "/style.css": ("style.css", "text/css")}


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, content, mime="application/json"):
        if mime == "application/json":
            content = json.dumps(content, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", mime + "; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, *args):
        pass

    def api(self, method):
        url = urlsplit(self.path)
        q = {k: v[-1] for k, v in parse_qs(url.query).items()}
        try:
            with closing(kb.connect(self.server.store, q.get("version"))) as db:
                if method == "GET" and url.path == "/api/catalog":
                    result = kb.search(db, q.get("q", ""), q.get("mapped") == "1", int(q.get("page", "1")))
                    result["summary"] = kb.summary(db)
                elif method == "GET" and url.path == "/api/product":
                    result = kb.detail(db, q.get("id", ""))
                elif method == "GET" and url.path == "/api/rules":
                    result = kb.rows(db, """SELECT r.*,p.name AS product_name,i.name AS ingredient_name FROM rules r
                        JOIN products p ON r.product=p.id JOIN ingredients i ON r.ingredient=i.id ORDER BY r.id""")
                    for r in result:
                        r["evidence"] = kb.evidence(db, r["source"], r["locator"])
                elif method == "POST" and url.path == "/api/check":
                    size = int(self.headers.get("Content-Length", 0))
                    kb.require(0 < size <= 16384, "请求大小无效")
                    data = json.loads(self.rfile.read(size))
                    kb.require(isinstance(data, dict) and set(data) == {"products"}, "请提供 products 数组")
                    result = kb.check(db, data["products"])
                else:
                    raise KeyError("接口不存在")
                self.reply(200, result)
        except KeyError as exc:
            self.reply(404, {"error": exc.args[0]})
        except (ValueError, TypeError) as exc:
            self.reply(400, {"error": str(exc)})
        except (OSError, sqlite3.Error):
            self.reply(500, {"error": "知识库读取失败"})

    def do_GET(self):
        asset = ASSETS.get(urlsplit(self.path).path)
        if asset:
            file, mime = asset
            self.reply(200, (kb.ROOT / "static" / file).read_bytes(), mime)
        else:
            self.api("GET")

    def do_POST(self):
        self.api("POST")


def main():
    cli = argparse.ArgumentParser(description="本机药品知识库")
    cli.add_argument("--store", type=Path, default=kb.STORE, help="本地数据库目录")
    cmd = cli.add_subparsers(dest="cmd", required=True)
    serve = cmd.add_parser("serve", help="启动本机界面，首次自动建库")
    serve.add_argument("--port", type=int, default=8765)
    load = cmd.add_parser("import", help="校验并启用完整 JSON 数据版本")
    load.add_argument("file", type=Path)
    check = cmd.add_parser("check", help="核查同时使用的产品编号")
    check.add_argument("products", nargs="+")
    check.add_argument("--version")
    args = cli.parse_args()
    if args.cmd == "import":
        print("已启用", kb.import_bundle(args.file, args.store))
        return
    if not (args.store / "active").exists():
        kb.import_bundle(kb.SEED, args.store, first=True)
    if args.cmd == "check":
        with closing(kb.connect(args.store, args.version)) as db:
            print(json.dumps(kb.check(db, args.products), indent=2, ensure_ascii=False))
        return
    with ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as server:
        server.store = args.store
        print(f"药品知识库已启动 http://127.0.0.1:{server.server_port}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, sqlite3.Error) as exc:
        sys.exit(str(exc))
    except KeyboardInterrupt:
        pass
