"""SQLite persistence with ownership checks and optimistic draft updates."""
import json
import os
import sqlite3
import secrets
import time
from contextlib import contextmanager
from pathlib import Path
from fastapi import HTTPException


def new_id():
    return secrets.token_hex(16)


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE,password TEXT,created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),request_id TEXT NOT NULL,role TEXT NOT NULL,data TEXT NOT NULL,created REAL NOT NULL,UNIQUE(conversation_id,request_id,role));
CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,image BLOB NOT NULL,analysis TEXT,created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,created REAL NOT NULL,updated REAL NOT NULL);
CREATE TABLE IF NOT EXISTS cards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),draft_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,audio BLOB,audio_mime TEXT,created REAL NOT NULL,UNIQUE(draft_id,revision));
CREATE TABLE IF NOT EXISTS reminders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),card_id TEXT NOT NULL REFERENCES cards(id),med_index INTEGER NOT NULL,at TEXT NOT NULL,timezone TEXT NOT NULL,enabled INTEGER NOT NULL,next_at REAL NOT NULL,created REAL NOT NULL,UNIQUE(user_id,card_id,med_index));
CREATE TABLE IF NOT EXISTS reminder_events(id TEXT PRIMARY KEY,reminder_id TEXT NOT NULL REFERENCES reminders(id),user_id TEXT NOT NULL REFERENCES users(id),scheduled REAL NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0,UNIQUE(reminder_id,scheduled));
CREATE INDEX IF NOT EXISTS due_reminders ON reminders(enabled,next_at);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),upload_id TEXT NOT NULL REFERENCES uploads(id),data TEXT NOT NULL,created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS pdf_documents(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,filename TEXT NOT NULL,content BLOB NOT NULL,page_count INTEGER NOT NULL,selected TEXT NOT NULL DEFAULT '[]',created REAL NOT NULL,updated REAL NOT NULL);
CREATE TABLE IF NOT EXISTS pdf_pages(document_id TEXT NOT NULL REFERENCES pdf_documents(id),page INTEGER NOT NULL,thumbnail BLOB NOT NULL,image BLOB,text TEXT NOT NULL DEFAULT '',upload_id TEXT UNIQUE REFERENCES uploads(id),error TEXT,PRIMARY KEY(document_id,page));
CREATE INDEX IF NOT EXISTS pdf_owner ON pdf_documents(user_id,updated);
PRAGMA user_version=2;
"""


class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = self.root / "health.sqlite3"
        with self.db() as db:
            db.executescript(SCHEMA)
        os.chmod(self.path, 0o600)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=15000")
        try:
            with db:
                yield db
        finally:
            db.close()

    def owned(self, db, table, item_id, user_id):
        assert table in {"conversations", "uploads", "drafts", "cards", "reminders", "reports", "pdf_documents"}
        row = db.execute(f"SELECT * FROM {table} WHERE id=? AND user_id=?", (item_id, user_id)).fetchone()
        if row is None:
            raise HTTPException(404, "记录不存在")
        return row

    def new_user(self, db):
        uid = new_id()
        db.execute("INSERT INTO users VALUES(?,NULL,NULL,?)", (uid, time.time()))
        db.execute("INSERT INTO profiles VALUES(?,?)", (uid, dump({})))
        return uid

    def draft(self, row):
        return {**json.loads(row["data"]), "id": row["id"], "revision": row["revision"]}

    def card(self, row):
        return {**json.loads(row["data"]), "id": row["id"], "audio_url": f"/api/v1/cards/{row['id']}/audio" if row["audio"] else None}
