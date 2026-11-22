"""Import immutable catalog releases and query one consistent release at a time."""
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from collections import defaultdict
from contextlib import closing
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from datetime import datetime

ROOT = Path(__file__).resolve().parent
SEED = ROOT / "data/catalog.json"
STORE = ROOT / ".run"
VERSION = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
SCHEMA = """
CREATE TABLE release(version TEXT PRIMARY KEY, digest TEXT NOT NULL);
CREATE TABLE sources(id TEXT PRIMARY KEY, title TEXT NOT NULL, publisher TEXT NOT NULL, date TEXT NOT NULL, url TEXT NOT NULL);
CREATE TABLE ingredients(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, aliases TEXT NOT NULL);
CREATE TABLE products(id TEXT PRIMARY KEY, name TEXT NOT NULL, approval TEXT NOT NULL, maker TEXT NOT NULL, spec TEXT NOT NULL,
 route TEXT NOT NULL, source TEXT NOT NULL REFERENCES sources, locator TEXT NOT NULL, mapping TEXT NOT NULL);
CREATE TABLE components(product TEXT REFERENCES products, ingredient TEXT REFERENCES ingredients, strength TEXT NOT NULL, PRIMARY KEY(product,ingredient));
CREATE INDEX component_ingredient ON components(ingredient,product);
CREATE TABLE rules(id TEXT PRIMARY KEY, product TEXT NOT NULL REFERENCES products, ingredient TEXT NOT NULL REFERENCES ingredients,
 route TEXT NOT NULL, finding TEXT NOT NULL, source TEXT NOT NULL REFERENCES sources, locator TEXT NOT NULL, status TEXT NOT NULL,
 reviewer TEXT NOT NULL, reviewed_on TEXT NOT NULL);
CREATE TABLE availability(product TEXT REFERENCES products, channel TEXT NOT NULL, region TEXT NOT NULL, status TEXT NOT NULL,
 observed_on TEXT NOT NULL, valid_until TEXT NOT NULL, source TEXT NOT NULL REFERENCES sources, locator TEXT NOT NULL,
 PRIMARY KEY(product,channel,region,observed_on));
"""
FIELDS = {
    "sources": "id title publisher date url",
    "ingredients": "id name aliases",
    "products": "id name approval maker spec route source locator mapping components",
    "rules": "id product ingredient route finding source locator status reviewer reviewed_on",
    "availability": "product channel region status observed_on valid_until source locator",
}
OPTIONAL_TEXT = {"aliases", "route", "strength", "reviewer", "reviewed_on"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def valid_date(value):
    require(date.fromisoformat(value).isoformat() == value, f"日期格式错误 {value}")


def check_keys(row, fields):
    require(isinstance(row, dict) and set(row) == set(fields), "字段不匹配，应包含 " + "、".join(fields))
    for k in fields:
        if k == "components":
            continue
        require(isinstance(row[k], str) and (row[k].strip() or k in OPTIONAL_TEXT), f"字段 {k} 应为文本且必填值不能为空")


def add_row(db, table, row):
    columns = list(row)
    sql = f"INSERT INTO {table} ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})"
    db.execute(sql, tuple(row.values()))


def populate(db, data):
    for table, names in FIELDS.items():
        require(isinstance(data[table], list), f"{table} 应为数组")
        for idx, record in enumerate(data[table], 1):
            try:
                check_keys(record, names.split())
                row = record.copy()
                if table == "products":
                    items = row.pop("components")
                    require(isinstance(items, list), "成分应为数组")
                    require(row["mapping"] in ("complete", "partial", "unknown"), "无效的成分映射状态")
                    require(bool(items) == (row["mapping"] != "unknown"), "成分列表与映射状态不一致")
                    add_row(db, table, row)
                    for comp in items:
                        check_keys(comp, ["ingredient", "strength"])
                        add_row(db, "components", dict(product=row["id"], **comp))
                    continue
                if table == "sources":
                    url = urlsplit(row["url"])
                    require(url.scheme in ("https", "http") and url.hostname, "原始来源须为网页地址")
                    valid_date(row["date"])
                if table == "rules":
                    require(row["route"].strip(), "须指定对方产品的给药途径")
                    require(row["status"] in ("draft", "reviewed"), "无效的规则状态")
                    if row["status"] == "reviewed":
                        require(row["reviewer"].strip(), "已审核规则需要审核者")
                        valid_date(row["reviewed_on"])
                    else:
                        require(not row["reviewer"] and not row["reviewed_on"], "草稿不能带有审核签署")
                if table == "availability":
                    require(row["status"] in ("在售", "停售"), "无效的渠道状态")
                    valid_date(row["observed_on"])
                    valid_date(row["valid_until"])
                    require(row["observed_on"] <= row["valid_until"], "确认日期晚于有效期")
                add_row(db, table, row)
            except (sqlite3.IntegrityError, TypeError, ValueError) as exc:
                raise ValueError(f"{table} 第 {idx} 条：{exc}") from exc
    require(data["products"], "目录不能为空")


def import_bundle(path, store=STORE, first=False):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    require(isinstance(data, dict) and set(data) == {"version", *FIELDS}, "无效的知识库文件")
    version = data["version"]
    require(isinstance(version, str) and VERSION.fullmatch(version), "版本号格式错误")
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    store.mkdir(parents=True, exist_ok=True)
    target = store / (version + ".sqlite3")
    with tempfile.TemporaryDirectory(dir=store) as tmp:
        stage = Path(tmp) / "release.db"
        with closing(sqlite3.connect(stage)) as db:
            db.execute("PRAGMA foreign_keys=ON")
            db.executescript(SCHEMA)
            with db:
                populate(db, data)
                db.execute("INSERT INTO release VALUES(?,?)", (version, digest))
        try:
            os.link(stage, target)
        except FileExistsError:
            with closing(connect(store, version)) as existing:
                require(existing.execute("SELECT digest FROM release").fetchone()[0] == digest,
                        "已有同名版本，修改内容后请使用新版本号")
        marker = Path(tmp) / "active"
        marker.write_text(version, encoding="ascii")
        if first:
            try:
                os.link(marker, store / "active")
            except FileExistsError:
                pass
        else:
            os.replace(marker, store / "active")
    return version


def connect(store=STORE, version=None):
    if version is None:
        version = (store / "active").read_text(encoding="ascii").strip()
    require(isinstance(version, str) and VERSION.fullmatch(version), "版本号格式错误")
    path = store / (version + ".sqlite3")
    if not path.is_file():
        raise KeyError("找不到指定知识库版本")
    db = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    return db


def rows(db, sql, params=()):
    return [dict(row) for row in db.execute(sql, params)]


def summary(db):
    return dict(db.execute("""SELECT version,
        (SELECT count(*) FROM products) AS products,
        (SELECT count(*) FROM products WHERE mapping='complete') AS mapped,
        (SELECT count(*) FROM rules WHERE status='reviewed') AS reviewed,
        (SELECT count(*) FROM rules WHERE status='draft') AS drafts FROM release""").fetchone())


def search(db, q="", mapped=False, page=1):
    where = []
    args = []
    if q.strip():
        term = "%" + q.strip().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%"
        conditions = [f"p.{col} LIKE ? ESCAPE '!'" for col in ("name", "maker", "approval", "id")]
        conditions.append("""EXISTS (SELECT 1 FROM components c JOIN ingredients i ON i.id=c.ingredient
            WHERE c.product=p.id AND (i.name LIKE ? ESCAPE '!' OR i.aliases LIKE ? ESCAPE '!'))""")
        where.append("(" + " OR ".join(conditions) + ")")
        args = [term] * 6
    if mapped:
        where.append("mapping='complete'")
    clause = " FROM products p" + (" WHERE " + " AND ".join(where) if where else "")
    total = db.execute("SELECT count(*)" + clause, args).fetchone()[0]
    per_page = 20
    page = min(max(page, 1), max(1, (total + per_page - 1) // per_page))
    items = rows(db, "SELECT p.*" + clause + """ ORDER BY (source='cr999') DESC,
        (mapping='complete') DESC,name,id LIMIT ? OFFSET ?""", [*args, per_page, (page - 1) * per_page])
    return dict(items=items, total=total, page=page, per_page=per_page)


def evidence(db, source, locator):
    row = dict(db.execute("SELECT * FROM sources WHERE id=?", (source,)).fetchone())
    return dict(**row, locator=locator)


def detail(db, pid):
    found = db.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
    if not found:
        raise KeyError("目录中没有指定产品")
    p = dict(found)
    p["evidence"] = evidence(db, p["source"], p["locator"])
    p["components"] = rows(db, """SELECT i.*, c.strength FROM components c JOIN ingredients i
        ON i.id=c.ingredient WHERE c.product=? ORDER BY i.id""", (pid,))
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
    observations = rows(db, """SELECT * FROM availability WHERE product=? AND observed_on<=?
        ORDER BY observed_on DESC,channel,region""", (pid, today))
    seen = set()
    for obs in observations:
        key = obs["channel"], obs["region"]
        obs["current"] = key not in seen and obs["valid_until"] >= today
        seen.add(key)
        obs["evidence"] = evidence(db, obs["source"], obs["locator"])
    p["availability"] = observations
    return p


def check(db, ids):
    require(isinstance(ids, list) and 2 <= len(ids) <= 30 and all(isinstance(i, str) for i in ids),
            "请提交 2 至 30 个同时使用的产品")
    require(len(set(ids)) == len(ids), "清单包含重复的产品编号")
    products = {pid: detail(db, pid) for pid in ids}
    ingredients = defaultdict(list)
    names = {}
    for pid, p in products.items():
        for comp in p["components"]:
            ingredients[comp["id"]].append(pid)
            names[comp["id"]] = comp["name"]
    duplicates = [dict(ingredient=names[i], products=pids, evidence=[products[p]["evidence"] for p in pids])
                  for i, pids in ingredients.items() if len(pids) > 1]
    interactions, candidates, missing_route = [], [], []
    for rule in rows(db, "SELECT * FROM rules ORDER BY id"):
        left = rule["product"]
        if left not in products:
            continue
        for right in ingredients.get(rule["ingredient"], []):
            if right == left:
                continue
            if not products[right]["route"]:
                missing_route.append(right)
                continue
            if products[right]["route"] != rule["route"]:
                continue
            group = interactions if rule["status"] == "reviewed" else candidates
            group.append(dict(**rule, products=[left, right], evidence=evidence(db, rule["source"], rule["locator"])))
    return dict(version=summary(db)["version"], products=[dict(id=p["id"],name=p["name"]) for p in products.values()],
                duplicates=duplicates, interactions=interactions, candidates=candidates,
                incomplete=[p["id"] for p in products.values() if p["mapping"] != "complete"],
                missing_route=sorted(set(missing_route)), reviewed_rule_count=summary(db)["reviewed"],
                scope="同时使用清单，仅核对已映射活性成分及本版已审核的特定产品相互作用。")
