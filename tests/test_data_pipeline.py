import json
import math
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from scripts.build_daily_catalog import (
    clean_daily_workbook,
    clean_marketplace_snapshot,
    clean_title,
    make_public_products,
)


ROOT = Path(__file__).resolve().parents[1]


class MarketplaceCleaningTest(unittest.TestCase):
    def test_campaign_language_is_removed_from_display_title(self):
        value = "【11-11预售】某品牌 保湿乳液50ml 双十一专享"
        cleaned = clean_title(value)
        self.assertEqual(cleaned, "某品牌 保湿乳液50ml")

    def test_latest_row_and_missing_signals_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "market.csv"
            rows = [
                ["2020/1/2", "A1", "【预售】保湿乳液50ml", 100, 10, 3, "店铺A"],
                ["2020/1/10", "A1", "保湿乳液50ml", 110, 20, 5, "店铺A"],
                ["2020/1/10", "A1", "保湿乳液50ml", 110, 20, 5, "店铺A"],
                ["2020/1/3", "A2", "清爽喷雾100ml", 80, None, None, "店铺B"],
            ]
            pd.DataFrame(rows, columns=["update_time", "id", "title", "price", "sale_count", "comment_count", "店名"]).to_csv(source, index=False, encoding="utf-8-sig")
            latest, quality = clean_marketplace_snapshot(source)
            self.assertEqual(quality["exact_duplicate_rows_removed"], 1)
            self.assertEqual(quality["unique_products"], 2)
            row = latest.set_index("source_product_id").loc["A1"]
            self.assertEqual(row["price"], 110)
            self.assertEqual(row["sale_count"], 20)
            missing = latest.set_index("source_product_id").loc["A2"]
            self.assertTrue(pd.isna(missing["sale_count"]))
            products = make_public_products(latest, {})
            by_id = {item["product_id"]: item for item in products}
            self.assertIsNone(by_id["A2"]["sales_count"])
            self.assertEqual(by_id["A2"]["evidence_level"], "historical_title_only")


class WorkbookCleaningTest(unittest.TestCase):
    def test_mixed_dates_numeric_suffixes_and_orphan_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "daily.xlsx"
            orders = pd.DataFrame(
                [
                    ["D1", "2020#3#2", "C1", "X1", "2个", "10元", 20],
                    ["D1", "2020#3#2", "C1", "X1", "2个", "10元", 20],
                    ["D2", "2020-03-10", "C2", "X1", 3, 10, 30],
                    ["D3", "2050-01-01", "C3", "X1", 1, 10, 10],
                    ["D4", "2020-03-11", "C4", "MISSING", 1, 5, 5],
                ],
                columns=["订单编码", "订单日期", "客户编码", "商品编号", "订购数量", "订购单价", "金额"],
            )
            products = pd.DataFrame([["X1", "面膜", "护肤品"]], columns=["商品编号", "商品小类", "商品大类"])
            with pd.ExcelWriter(source, engine="openpyxl") as writer:
                orders.to_excel(writer, sheet_name="销售订单表", index=False)
                products.to_excel(writer, sheet_name="商品信息表", index=False)
            summary, quality = clean_daily_workbook(source)
            self.assertEqual(quality["exact_duplicate_rows_removed"], 1)
            self.assertEqual(quality["invalid_or_out_of_range_date_rows_excluded"], 1)
            self.assertEqual(quality["orphan_product_rows_excluded"], 1)
            self.assertEqual(summary[0]["quantity"], 5)
            self.assertEqual(summary[0]["amount"], 50)
            self.assertNotIn("客户编码", summary[0])
            self.assertNotIn("订单编码", summary[0])


class PublishedDataContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.products = json.loads((ROOT / "public" / "data" / "daily-products.json").read_text(encoding="utf-8"))
        cls.metrics = json.loads((ROOT / "public" / "data" / "metrics.json").read_text(encoding="utf-8"))
        cls.search_identities = json.loads((ROOT / "data" / "daily_chemicals" / "product-identities.json").read_text(encoding="utf-8"))

    def test_public_catalog_has_expected_scope(self):
        self.assertEqual(len(self.products), 3497)
        self.assertEqual(len({item["product_id"] for item in self.products}), len(self.products))
        self.assertEqual(self.metrics["dataset"]["products"], len(self.products))
        self.assertEqual(sum(item["evidence_level"] == "official_current_reference" for item in self.products), 5)
        self.assertEqual(len(self.search_identities), len(self.products))
        self.assertEqual(sum(bool(item.get("official_urls")) for item in self.search_identities), 5)
        self.assertTrue(all("price" not in item and "sales_count" not in item for item in self.search_identities))
        official_urls = [url for item in self.search_identities for url in item.get("official_urls", [])]
        self.assertEqual(len(official_urls), len(set(official_urls)))

    def test_public_catalog_does_not_expose_dates_or_personal_records(self):
        forbidden_fields = {"update_time", "snapshot_time", "snapshot_date", "客户编码", "订单编码"}
        forbidden_text = ("11-11", "11.11", "双十一", "双11")
        for product in self.products:
            self.assertTrue(forbidden_fields.isdisjoint(product))
            self.assertFalse(any(marker in product["name"] for marker in forbidden_text))
            self.assertFalse(any(marker in product["source_title"] for marker in forbidden_text))
            self.assertEqual(product["price_label"], "样本价")

    def test_scores_are_finite_and_advanced_modes_are_evidence_gated(self):
        keys = ["efficacy", "sensitivity", "ingredientTransparency", "value", "popularity", "reviewSignal"]
        for product in self.products:
            for key in keys:
                self.assertTrue(math.isfinite(product[key]))
                self.assertGreaterEqual(product[key], 0)
                self.assertLessEqual(product[key], 1)
            if product["recommendation_eligibility"]["sensitive_skin"]:
                self.assertEqual(product["evidence_level"], "official_current_reference")
                self.assertTrue(product["evidence_sources"])


if __name__ == "__main__":
    unittest.main()
