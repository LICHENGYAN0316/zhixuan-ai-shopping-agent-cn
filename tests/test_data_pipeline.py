from __future__ import annotations

import json
import hashlib
import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "zhixuan_ecommerce.db"


class DataPipelineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.connection = sqlite3.connect(DB_PATH)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.connection.close()

    def scalar(self, query: str):
        return self.connection.execute(query).fetchone()[0]

    def test_expected_row_counts(self) -> None:
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM products"), 720)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM users"), 2500)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM queries"), 8000)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM interactions"), 96000)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM reviews"), 5000)

    def test_references_are_valid(self) -> None:
        orphan_products = self.scalar(
            "SELECT COUNT(*) FROM interactions i LEFT JOIN products p ON i.product_id=p.product_id WHERE p.product_id IS NULL"
        )
        orphan_queries = self.scalar(
            "SELECT COUNT(*) FROM interactions i LEFT JOIN queries q ON i.query_id=q.query_id WHERE q.query_id IS NULL"
        )
        self.assertEqual(orphan_products, 0)
        self.assertEqual(orphan_queries, 0)

    def test_splits_are_query_disjoint(self) -> None:
        overlaps = self.scalar(
            "SELECT COUNT(*) FROM (SELECT query_id FROM interactions GROUP BY query_id HAVING COUNT(DISTINCT split) > 1)"
        )
        self.assertEqual(overlaps, 0)

    def test_values_are_in_valid_ranges(self) -> None:
        invalid_relevance = self.scalar("SELECT COUNT(*) FROM interactions WHERE relevance_grade NOT BETWEEN 0 AND 3")
        invalid_price = self.scalar("SELECT COUNT(*) FROM products WHERE price <= 0 OR original_price < price")
        invalid_rating = self.scalar("SELECT COUNT(*) FROM products WHERE rating NOT BETWEEN 0 AND 5")
        self.assertEqual(invalid_relevance, 0)
        self.assertEqual(invalid_price, 0)
        self.assertEqual(invalid_rating, 0)

    def test_metrics_are_real_and_bounded(self) -> None:
        metrics = json.loads((ROOT / "reports" / "metrics.json").read_text(encoding="utf-8"))
        for group in ["model", "popularity_baseline", "price_baseline", "validation"]:
            for value in metrics[group].values():
                self.assertGreaterEqual(value, 0.0)
                self.assertLessEqual(value, 1.0)
        self.assertGreater(metrics["model"]["ndcg@10"], metrics["popularity_baseline"]["ndcg@10"])

    def test_manifest_declares_synthetic_source(self) -> None:
        manifest = json.loads((ROOT / "data" / "generated" / "manifest.json").read_text(encoding="utf-8"))
        self.assertTrue(manifest["synthetic_data"])
        self.assertEqual(manifest["seed"], 20260828)
        digest = hashlib.sha256(DB_PATH.read_bytes()).hexdigest()
        self.assertEqual(manifest["files"][DB_PATH.name]["sha256"], digest)


if __name__ == "__main__":
    unittest.main()
