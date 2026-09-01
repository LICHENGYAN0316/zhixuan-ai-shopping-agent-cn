#!/usr/bin/env python3
"""Build the public daily-chemicals demo catalog from user-supplied source files.

The raw workbooks are read-only inputs. Public outputs contain one latest
historical product record per source id and no customer/order identifiers.
Verified formula and claim fields come only from the manually reviewed
attribute table in ``data/daily_chemicals``.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from typing import Any, Iterable

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_VERIFIED = ROOT / "data" / "daily_chemicals" / "verified_product_attributes.json"


CATEGORY_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("套装", ("套装", "礼盒", "组合", "全家桶")),
    ("清洁卸妆", ("卸妆", "洁面", "洗面奶", "洗颜", "清洁膏", "清洁泥膜")),
    ("防晒", ("防晒", "隔离霜", "防护乳", "防护霜")),
    ("底妆", ("散粉", "蜜粉", "粉底", "bb霜", "cc霜", "遮瑕", "气垫", "定妆")),
    ("唇部彩妆", ("口红", "唇膏", "唇彩", "唇釉", "染唇")),
    ("眼部彩妆", ("眼影", "眼线", "睫毛", "眉笔", "眉粉", "眉膏")),
    ("面部护理", ("面膜", "精华", "乳液", "面霜", "爽肤水", "化妆水", "喷雾", "护肤", "眼霜", "肌底液", "原液", "美容液")),
    ("身体护理", ("沐浴", "身体乳", "身体霜", "磨砂膏", "止汗", "脱毛")),
    ("手足护理", ("护手", "手膜", "足膜", "护足")),
    ("洗护发", ("洗发", "护发", "发膜", "染发", "定型", "弹力素", "头皮")),
    ("香氛", ("香水", "古龙水", "香氛")),
    ("口腔护理", ("牙膏", "漱口", "牙粉", "口腔")),
    ("家居清洁", ("洗衣", "洗洁精", "柔顺剂", "洁厕", "消毒液", "清洁剂")),
]

PRODUCT_TYPE_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("散粉", ("散粉", "蜜粉")),
    ("喷雾", ("喷雾",)),
    ("乳液", ("乳液", "润肤乳", "保湿乳")),
    ("面霜", ("面霜", "保湿霜", "晚霜", "日霜")),
    ("面膜", ("面膜", "睡眠膜")),
    ("精华", ("精华", "肌底液", "原液")),
    ("化妆水", ("化妆水", "爽肤水", "精华水")),
    ("洁面", ("洁面", "洗面奶", "洗颜")),
    ("卸妆", ("卸妆",)),
    ("防晒", ("防晒", "防护乳", "防护霜")),
    ("粉底", ("粉底", "气垫", "bb霜", "cc霜")),
    ("口红", ("口红", "唇膏", "唇釉")),
    ("眼部彩妆", ("眼影", "眼线", "睫毛", "眉笔")),
    ("洗发护发", ("洗发", "护发", "发膜")),
    ("身体护理", ("沐浴", "身体乳", "护手")),
    ("香水", ("香水", "古龙水")),
    ("套装", ("套装", "礼盒", "组合")),
]

EFFECT_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("保湿", ("保湿", "补水", "水润")),
    ("舒缓", ("舒缓", "舒敏", "镇静")),
    ("修护", ("修护", "修复", "屏障")),
    ("控油", ("控油", "吸油", "抑油")),
    ("清洁", ("清洁", "洁面", "去污")),
    ("紧致", ("紧致", "抗老", "抗皱", "淡纹")),
    ("提亮", ("提亮", "亮肤", "美白", "淡斑")),
    ("祛痘", ("祛痘", "去痘", "抗痘", "痘肌")),
    ("防晒", ("防晒", "防护", "spf")),
    ("定妆", ("定妆", "持妆", "不脱妆")),
    ("卸妆", ("卸妆",)),
    ("去屑", ("去屑", "头屑")),
    ("柔顺", ("柔顺", "顺滑", "柔滑")),
]

INGREDIENT_MENTION_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("烟酰胺", ("烟酰胺", "niacinamide")),
    ("水杨酸", ("水杨酸", "bha")),
    ("玻尿酸", ("玻尿酸", "透明质酸", "玻尿酸钠")),
    ("神经酰胺", ("神经酰胺",)),
    ("视黄醇", ("视黄醇", "a醇", "retinol")),
    ("维生素C", ("维生素c", "维c", "vc精华")),
    ("积雪草", ("积雪草", "cica")),
    ("茶树", ("茶树",)),
]


def _contains_any(text: str, words: Iterable[str]) -> bool:
    lowered = text.casefold()
    return any(word.casefold() in lowered for word in words)


def infer_category(title: str) -> str:
    for category, words in CATEGORY_RULES:
        if _contains_any(title, words):
            return category
    return "其他日化"


def infer_product_type(title: str) -> str:
    for product_type, words in PRODUCT_TYPE_RULES:
        if _contains_any(title, words):
            return product_type
    return "其他"


def infer_tags(title: str, rules: list[tuple[str, tuple[str, ...]]]) -> list[str]:
    return [label for label, words in rules if _contains_any(title, words)]


def clean_title(value: Any) -> str:
    """Remove dated campaign language while retaining product identity text."""
    text = "" if pd.isna(value) else str(value)
    text = re.sub(r"[【\[].*?[】\]]", " ", text)
    text = re.sub(r"(?i)(?:11[.\-/]11|双十一|双11)", " ", text)
    text = re.sub(r"(?:仅限|抢先|限时)?(?:专享|预售|特供|特惠)", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" -_")
    return text


def extract_size(title: str) -> dict[str, Any]:
    matches = re.findall(r"(\d+(?:\.\d+)?)\s*(ml|mL|ML|g|G|kg|KG|l|L)(?![a-zA-Z])", title)
    if not matches:
        return {"size_value": None, "size_unit": None}
    raw_value, raw_unit = matches[0]
    unit = raw_unit.casefold()
    if unit == "kg":
        return {"size_value": float(raw_value) * 1000, "size_unit": "g"}
    if unit == "l":
        return {"size_value": float(raw_value) * 1000, "size_unit": "ml"}
    value = float(raw_value)
    return {"size_value": int(value) if value.is_integer() else value, "size_unit": unit}


def _nullable_int(value: Any) -> int | None:
    if pd.isna(value):
        return None
    return int(round(float(value)))


def _finite_float(value: Any) -> float | None:
    if pd.isna(value):
        return None
    result = float(value)
    return result if math.isfinite(result) else None


def _percentile(series: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    ranked = numeric.rank(method="average", pct=True)
    return ranked.fillna(0.0).clip(0.0, 1.0)


def _value_score(frame: pd.DataFrame) -> pd.Series:
    result = pd.Series(index=frame.index, dtype="float64")
    for _, indices in frame.groupby("category", dropna=False).groups.items():
        prices = frame.loc[indices, "price"]
        result.loc[indices] = 1.0 - prices.rank(method="average", pct=True) + (0.5 / max(len(indices), 1))
    return result.clip(0.0, 1.0).fillna(0.0)


def load_verified_attributes(path: Path) -> dict[str, dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    ids = [str(item["source_product_id"]) for item in data]
    if len(ids) != len(set(ids)):
        raise ValueError("verified attribute table contains duplicate source_product_id values")
    return {str(item["source_product_id"]): item for item in data}


def clean_marketplace_snapshot(source: Path) -> tuple[pd.DataFrame, dict[str, Any]]:
    raw = pd.read_csv(source, encoding="utf-8-sig")
    required = {"update_time", "id", "title", "price", "sale_count", "comment_count", "店名"}
    missing = sorted(required - set(raw.columns))
    if missing:
        raise ValueError(f"marketplace snapshot is missing columns: {missing}")

    raw_rows = len(raw)
    duplicate_rows = int(raw.duplicated().sum())
    clean = raw.drop_duplicates().copy()
    clean["snapshot_time"] = pd.to_datetime(clean["update_time"], errors="coerce")
    invalid_dates = int(clean["snapshot_time"].isna().sum())
    clean["price"] = pd.to_numeric(clean["price"], errors="coerce")
    clean["sale_count"] = pd.to_numeric(clean["sale_count"], errors="coerce")
    clean["comment_count"] = pd.to_numeric(clean["comment_count"], errors="coerce")
    invalid_prices = int((clean["price"].isna() | (clean["price"] <= 0)).sum())
    negative_signals = int(((clean["sale_count"] < 0) | (clean["comment_count"] < 0)).fillna(False).sum())
    clean = clean[
        clean["snapshot_time"].notna()
        & clean["price"].notna()
        & (clean["price"] > 0)
        & ~((clean["sale_count"] < 0) | (clean["comment_count"] < 0)).fillna(False)
    ].copy()
    clean["source_product_id"] = clean["id"].astype(str).str.strip()
    clean["source_title"] = clean["title"].astype(str).str.replace(r"\s+", " ", regex=True).str.strip()
    clean["name"] = clean["source_title"].map(clean_title)
    clean["shop_name"] = clean["店名"].fillna("未标注店铺").astype(str).str.strip()

    key_duplicates = int(clean.duplicated(["source_product_id", "snapshot_time"]).sum())
    if key_duplicates:
        clean = clean.sort_index().drop_duplicates(["source_product_id", "snapshot_time"], keep="last")
    latest = clean.sort_values(["source_product_id", "snapshot_time"]).groupby("source_product_id", as_index=False).tail(1).copy()
    latest["category"] = latest["name"].map(infer_category)
    latest["product_type"] = latest["name"].map(infer_product_type)
    latest["merchant_claim_tags"] = latest["name"].map(lambda title: infer_tags(title, EFFECT_RULES))
    latest["title_ingredient_mentions"] = latest["name"].map(lambda title: infer_tags(title, INGREDIENT_MENTION_RULES))
    sizes = latest["name"].map(extract_size).apply(pd.Series)
    latest["size_value"] = sizes["size_value"]
    latest["size_unit"] = sizes["size_unit"]
    latest["popularity"] = _percentile(latest["sale_count"])
    latest["review_signal"] = _percentile(latest["comment_count"])
    latest["value"] = _value_score(latest)

    missing_signals = latest["sale_count"].isna() & latest["comment_count"].isna()
    quality = {
        "source_kind": "offline_marketplace_product_snapshot",
        "raw_rows": raw_rows,
        "exact_duplicate_rows_removed": duplicate_rows,
        "duplicate_product_time_rows_resolved": key_duplicates,
        "invalid_date_rows_excluded": invalid_dates,
        "invalid_price_rows_excluded": invalid_prices,
        "negative_signal_rows_excluded": negative_signals,
        "clean_snapshot_rows": int(len(clean)),
        "unique_products": int(latest["source_product_id"].nunique()),
        "unique_shops": int(latest["shop_name"].nunique()),
        "products_missing_both_historical_signals": int(missing_signals.sum()),
        "historical_signal_coverage": round(float((~missing_signals).mean()), 6),
        "price_completeness": round(float(latest["price"].notna().mean()), 6),
        "dates_exposed_in_public_catalog": False,
        "customer_or_order_fields_exposed": False,
    }
    return latest, quality


def _normalize_term(value: str) -> str:
    text = value.casefold().strip()
    replacements = {
        "parfum": "fragrance",
        "香精": "fragrance",
        "香料": "fragrance",
        "parabens": "paraben",
        "对羟基苯甲酸酯": "paraben",
        "矿物油": "mineral oil",
        "变性乙醇": "drying alcohol",
        "alcohol denat.": "drying alcohol",
    }
    return replacements.get(text, text)


def make_public_products(latest: pd.DataFrame, verified_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for row in latest.sort_values("source_product_id").to_dict(orient="records"):
        source_id = str(row["source_product_id"])
        verified = verified_by_id.get(source_id)
        evidence_level = "official_current_reference" if verified else "historical_title_only"
        eligibility = (verified or {}).get(
            "recommendation_eligibility",
            {"basic_retrieval": True, "efficacy": False, "sensitive_skin": False, "ingredient_avoidance": False},
        )
        ingredient_completeness = (verified or {}).get("ingredient_list_completeness", "none")
        ingredient_transparency = 1.0 if ingredient_completeness in {"full", "full_current_reference"} else 0.55 if ingredient_completeness == "key_only" else 0.0
        sensitivity = 1.0 if eligibility.get("sensitive_skin") else 0.0
        efficacy = 0.9 if eligibility.get("efficacy") else min(0.45, 0.15 + 0.08 * len(row["merchant_claim_tags"]))
        display_name = (verified or {}).get("canonical_product_name") or row["name"]
        canonical_brand = (verified or {}).get("canonical_brand")
        if verified:
            claims = [claim["claim"] for claim in verified.get("brand_claims", [])]
            highlights = "当前官方参考已核实：" + "；".join(claims[:1]) if claims else "当前官方参考已核实产品身份与成分字段。"
            limitations = verified.get("notes", "官方参考与历史商品记录需分层理解。")
        else:
            tags = "、".join(row["merchant_claim_tags"][:3])
            highlights = f"历史商品标题中包含“{tags}”等商家描述，尚未核实。" if tags else "仅有历史标题、样本价和历史热度字段。"
            limitations = "未核实完整配方与产品级功效，不用于敏感肌、成分避雷或功效结论。"
        product = {
            "product_id": source_id,
            "name": display_name,
            "source_title": row["name"],
            "category": (verified or {}).get("category") or row["category"],
            "product_type": (verified or {}).get("product_type") or row["product_type"],
            "brand": canonical_brand or row["shop_name"],
            "shop_name": row["shop_name"],
            "price": round(float(row["price"]), 2),
            "price_label": "样本价",
            "sales_count": _nullable_int(row["sale_count"]),
            "review_count": _nullable_int(row["comment_count"]),
            "size_value": _finite_float(row["size_value"]),
            "size_unit": None if pd.isna(row["size_unit"]) else str(row["size_unit"]),
            "merchant_claim_tags": list(row["merchant_claim_tags"]),
            "title_ingredient_mentions": list(row["title_ingredient_mentions"]),
            "historical_data": True,
            "evidence_level": evidence_level,
            "match_status": (verified or {}).get("match_status", "legacy_unmatched"),
            "formula_market": (verified or {}).get("formula_market"),
            "formula_version_label": (verified or {}).get("formula_version_label"),
            "formula_checked_at": (verified or {}).get("formula_checked_at"),
            "ingredient_list_completeness": ingredient_completeness,
            "ingredients": list((verified or {}).get("ingredients", [])),
            "normalized_ingredients": [_normalize_term(item) for item in (verified or {}).get("ingredients", [])],
            "official_formulated_without": list((verified or {}).get("official_formulated_without", [])),
            "normalized_formulated_without": [_normalize_term(item) for item in (verified or {}).get("official_formulated_without", [])],
            "official_skin_types": list((verified or {}).get("official_skin_types", [])),
            "official_concerns": list((verified or {}).get("official_concerns", [])),
            "brand_claims": list((verified or {}).get("brand_claims", [])),
            "recommendation_eligibility": eligibility,
            "evidence_sources": list((verified or {}).get("evidence_sources", [])),
            "description": f"{row['category']} / {row['product_type']}；数据来源为离线历史商品快照。",
            "highlights": highlights,
            "limitations": limitations,
            "efficacy": round(float(efficacy), 6),
            "sensitivity": round(float(sensitivity), 6),
            "ingredientTransparency": round(float(ingredient_transparency), 6),
            "value": round(float(row["value"]), 6),
            "popularity": round(float(row["popularity"]), 6),
            "reviewSignal": round(float(row["review_signal"]), 6),
        }
        output.append(product)
    return output


def _extract_number(series: pd.Series) -> pd.Series:
    extracted = series.astype(str).str.replace(",", "", regex=False).str.extract(r"([-+]?\d+(?:\.\d+)?)", expand=False)
    return pd.to_numeric(extracted, errors="coerce")


def clean_daily_workbook(source: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    orders = pd.read_excel(source, sheet_name="销售订单表")
    products = pd.read_excel(source, sheet_name="商品信息表")
    required_orders = {"订单编码", "订单日期", "商品编号", "订购数量", "订购单价", "金额"}
    required_products = {"商品编号", "商品小类", "商品大类"}
    if missing := sorted(required_orders - set(orders.columns)):
        raise ValueError(f"sales order sheet is missing columns: {missing}")
    if missing := sorted(required_products - set(products.columns)):
        raise ValueError(f"product sheet is missing columns: {missing}")

    raw_rows = len(orders)
    duplicate_rows = int(orders.duplicated().sum())
    clean = orders.drop_duplicates().copy()
    date_text = clean["订单日期"].astype(str).str.replace("#", "-", regex=False).str.strip()
    clean["parsed_date"] = pd.to_datetime(date_text, errors="coerce", format="mixed")
    current_year = pd.Timestamp.now().year
    invalid_date_mask = clean["parsed_date"].isna() | (clean["parsed_date"].dt.year < 2000) | (clean["parsed_date"].dt.year > current_year)
    invalid_dates = int(invalid_date_mask.sum())
    clean["quantity"] = _extract_number(clean["订购数量"])
    clean["unit_price"] = _extract_number(clean["订购单价"])
    clean["amount_numeric"] = pd.to_numeric(clean["金额"], errors="coerce")
    invalid_numeric_mask = (
        clean["quantity"].isna()
        | clean["unit_price"].isna()
        | clean["amount_numeric"].isna()
        | (clean["quantity"] <= 0)
        | (clean["unit_price"] <= 0)
        | (clean["amount_numeric"] < 0)
    )
    invalid_numeric = int(invalid_numeric_mask.sum())
    clean = clean[~invalid_date_mask & ~invalid_numeric_mask].copy()
    clean["商品编号"] = clean["商品编号"].astype(str).str.strip()
    products = products.drop_duplicates("商品编号").copy()
    products["商品编号"] = products["商品编号"].astype(str).str.strip()
    merged = clean.merge(products[["商品编号", "商品小类", "商品大类"]], on="商品编号", how="left", validate="many_to_one", indicator=True)
    orphan_rows = int((merged["_merge"] != "both").sum())
    merged = merged[merged["_merge"] == "both"].copy()
    formula_mismatch = int(((merged["quantity"] * merged["unit_price"] - merged["amount_numeric"]).abs() > 0.01).sum())
    aggregate = (
        merged.groupby(["商品编号", "商品大类", "商品小类"], as_index=False)
        .agg(order_count=("订单编码", "nunique"), quantity=("quantity", "sum"), amount=("amount_numeric", "sum"))
        .sort_values("商品编号")
    )
    summary = [
        {
            "product_code": row["商品编号"],
            "category": row["商品大类"],
            "subcategory": row["商品小类"],
            "order_count": int(row["order_count"]),
            "quantity": int(round(row["quantity"])),
            "amount": round(float(row["amount"]), 2),
        }
        for row in aggregate.to_dict(orient="records")
    ]
    quality = {
        "source_kind": "offline_daily_chemicals_sales_workbook",
        "raw_order_rows": raw_rows,
        "exact_duplicate_rows_removed": duplicate_rows,
        "invalid_or_out_of_range_date_rows_excluded": invalid_dates,
        "invalid_numeric_rows_excluded": invalid_numeric,
        "orphan_product_rows_excluded": orphan_rows,
        "amount_formula_mismatch_rows": formula_mismatch,
        "clean_rows_used_for_aggregate": int(len(merged)),
        "aggregate_products": int(len(aggregate)),
        "customer_ids_exported": False,
        "order_ids_exported": False,
        "raw_locations_exported": False,
    }
    return summary, quality


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build(
    beauty_csv: Path,
    daily_xlsx: Path,
    verified_path: Path,
    output_dir: Path,
    public_dir: Path,
) -> dict[str, Any]:
    latest, marketplace_quality = clean_marketplace_snapshot(beauty_csv)
    verified_by_id = load_verified_attributes(verified_path)
    missing_verified_ids = sorted(set(verified_by_id) - set(latest["source_product_id"]))
    if missing_verified_ids:
        raise ValueError(f"verified ids not found in marketplace source: {missing_verified_ids}")
    products = make_public_products(latest, verified_by_id)
    category_summary, workbook_quality = clean_daily_workbook(daily_xlsx)

    verified_count = sum(product["evidence_level"] == "official_current_reference" for product in products)
    sensitive_count = sum(product["recommendation_eligibility"]["sensitive_skin"] for product in products)
    ingredient_count = sum(product["recommendation_eligibility"]["ingredient_avoidance"] for product in products)
    efficacy_count = sum(product["recommendation_eligibility"]["efficacy"] for product in products)
    quality = {
        "generated_schema_version": "1.0.0",
        "marketplace": marketplace_quality,
        "daily_workbook": workbook_quality,
        "verified_attribute_rows": verified_count,
        "sensitive_skin_eligible_products": sensitive_count,
        "ingredient_avoidance_eligible_products": ingredient_count,
        "efficacy_eligible_products": efficacy_count,
        "truth_boundary": {
            "historical_titles_are_unverified_claims": True,
            "current_official_pages_do_not_prove_historical_formula_identity": True,
            "sample_price_is_not_presented_as_live_market_data": True,
        },
    }
    metrics = {
        "dataset": {
            "products": marketplace_quality["unique_products"],
            "shops": marketplace_quality["unique_shops"],
            "price_completeness": marketplace_quality["price_completeness"],
            "historical_signal_coverage": marketplace_quality["historical_signal_coverage"],
            "verified_products": verified_count,
            "sensitive_skin_eligible": sensitive_count,
            "ingredient_avoidance_eligible": ingredient_count,
            "efficacy_eligible": efficacy_count,
        }
    }
    manifest = {
        "dataset": "offline_daily_chemicals_historical_catalog",
        "schema_version": "1.0.0",
        "products": len(products),
        "source_layers": [
            "offline marketplace product snapshots",
            "de-identified daily-chemicals category aggregates",
            "manually reviewed current official product references",
        ],
        "public_files": ["daily-products.json", "metrics.json", "manifest.json"],
        "contains_live_prices": False,
        "contains_customer_or_order_records": False,
        "advanced_recommendations_require_verified_evidence": True,
    }
    write_json(public_dir / "daily-products.json", products)
    write_json(public_dir / "metrics.json", metrics)
    write_json(public_dir / "manifest.json", manifest)
    write_json(output_dir / "category_sales_summary.json", category_summary)
    write_json(output_dir / "catalog_quality.json", quality)
    return {"products": len(products), "quality": quality, "manifest": manifest}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--beauty-csv", type=Path, required=True, help="Path to the marketplace product snapshot CSV")
    parser.add_argument("--daily-xlsx", type=Path, required=True, help="Path to the daily-chemicals sales workbook")
    parser.add_argument("--verified", type=Path, default=DEFAULT_VERIFIED, help="Path to manually verified product attributes")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data" / "daily_chemicals")
    parser.add_argument("--public-dir", type=Path, default=ROOT / "public" / "data")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = build(args.beauty_csv, args.daily_xlsx, args.verified, args.output_dir, args.public_dir)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
