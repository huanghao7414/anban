import json
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

import knowledge as kb


class KnowledgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Path(self.temp.name) / "store"
        self.file = Path(self.temp.name) / "release.json"
        self.seed = json.loads(kb.SEED.read_text())
        self.version = kb.import_bundle(kb.SEED, self.store)
        self.db = kb.connect(self.store)
        self.addCleanup(self.db.close)

    def publish(self):
        self.file.write_text(json.dumps(self.seed, ensure_ascii=False))
        return kb.import_bundle(self.file, self.store)

    def test_single_compound_overlap_and_provenance(self):
        r = kb.check(self.db, ["H42022510", "H51021559", "H32020797"])
        self.assertEqual(r["duplicates"][0]["ingredient"], "对乙酰氨基酚")
        self.assertEqual(len(r["duplicates"][0]["evidence"]), 2)
        self.assertEqual(r["interactions"], [])
        self.assertEqual(r["candidates"][0]["products"], ["H42022510","H32020797"])

    def test_unknown_mapping_and_similar_products(self):
        r = kb.check(self.db, ["H13023521", "H32020797"])
        self.assertEqual(r["incomplete"], ["H13023521"])
        self.assertFalse(r["candidates"])
        with self.assertRaises(KeyError):
            kb.check(self.db, ["unknown", "H42022510"])
        with self.assertRaises(ValueError):
            kb.check(self.db, ["H42022510"] * 2)

    def test_literal_search_and_pagination(self):
        self.assertIn("H42022510", [x["id"] for x in kb.search(self.db, "扑热息痛")["items"]])
        self.assertEqual(kb.search(self.db, "H51021559")["total"], 1)
        self.assertEqual(kb.search(self.db, "___")["total"], 0)
        first = kb.search(self.db)
        second = kb.search(self.db, page=2)
        self.assertFalse({p["id"] for p in first["items"]} & {p["id"] for p in second["items"]})

    def test_new_release_and_old_replay(self):
        self.seed["version"] = "test-v2"
        self.seed["rules"][0].update(status="reviewed", reviewer="测试审核", reviewed_on="2026-11-19")
        self.publish()
        ids = ["H32020797","H42022510"]
        with closing(kb.connect(self.store)) as new:
            self.assertEqual(len(kb.check(new, ids)["interactions"]), 1)
        with closing(kb.connect(self.store,self.version)) as old:
            self.assertFalse(kb.check(old, ids)["interactions"])
        self.assertEqual(kb.import_bundle(kb.SEED, self.store), self.version)

    def test_invalid_import_is_atomic(self):
        self.seed["version"] = "bad-release"
        self.seed["rules"][0]["source"] = "missing"
        with self.assertRaises(ValueError):
            self.publish()
        self.assertFalse((self.store / "bad-release.sqlite3").exists())
        with closing(kb.connect(self.store)) as active:
            self.assertEqual(kb.summary(active)["version"], self.version)

    def test_same_version_cannot_change(self):
        self.seed["rules"] = []
        with self.assertRaises(ValueError):
            self.publish()

    def test_route_and_channel_validity(self):
        self.seed["version"] = "route-test"
        product = next(p for p in self.seed["products"] if p["id"] == "H32020797")
        product["route"] = ""
        obs = dict(product=product["id"], channel="测试药房", region="测试区域", source="liangshan", locator="测试行")
        self.seed["availability"] = [
            dict(**obs, status="在售",observed_on="2001-01-01",valid_until="2099-01-01"),
            dict(**obs, status="停售",observed_on="2002-01-01",valid_until="2002-01-31")]
        self.publish()
        with closing(kb.connect(self.store)) as db:
            r = kb.check(db, ["H42022510", product["id"]])
            self.assertEqual(r["missing_route"], [product["id"]])
            self.assertFalse(r["candidates"])
            self.assertFalse(any(o["current"] for o in kb.detail(db, product["id"])["availability"]))


if __name__ == "__main__":
    unittest.main()
