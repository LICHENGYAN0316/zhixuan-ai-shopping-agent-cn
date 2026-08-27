#!/usr/bin/env python3
"""生成可复现的中文 3C 电商合成数据与 SQLite 数据库。"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


SEED = 20260828
REFERENCE_TIME = datetime(2026, 8, 28, 9, 0, tzinfo=timezone(timedelta(hours=10)))
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "generated"
DB_PATH = ROOT / "data" / "zhixuan_ecommerce.db"
PUBLIC_DATA_DIR = ROOT / "public" / "data"

BRANDS = ["星云", "岚川", "极昼", "澄光", "矩阵", "森屿", "云驰", "玄甲"]
SERIES = ["Air", "Pro", "Max", "Neo", "S", "One", "Go", "Studio"]
USE_CASES = ["学习办公", "编程开发", "影音娱乐", "轻度游戏", "内容创作", "差旅通勤"]

CATEGORY_CONFIG: dict[str, dict[str, Any]] = {
    "笔记本电脑": {"price": (3299, 12999), "focus": ["performance", "battery", "portability", "display", "gaming", "office"]},
    "智能手机": {"price": (1299, 8999), "focus": ["performance", "battery", "portability", "display", "camera", "connectivity"]},
    "平板电脑": {"price": (1499, 6999), "focus": ["performance", "battery", "portability", "display", "office", "audio"]},
    "头戴耳机": {"price": (299, 3299), "focus": ["battery", "portability", "audio", "quality", "connectivity"]},
    "显示器": {"price": (699, 5999), "focus": ["display", "gaming", "office", "quality", "connectivity"]},
    "键鼠套装": {"price": (129, 1999), "focus": ["gaming", "office", "quality", "portability", "connectivity"]},
}

FEATURE_COLUMNS = [
    "performance", "battery", "portability", "display", "camera", "audio",
    "gaming", "office", "connectivity", "quality", "sustainability",
]

QUERY_TEMPLATES = [
    "预算{budget}元，主要用于{use_case}，希望{preference}，帮我推荐{category}",
    "想买一款{category}，平时{use_case}，预算不超过{budget}元，比较看重{preference}",
    "{budget}元以内的{category}，{use_case}用，要求{preference}",
    "请推荐适合{use_case}的{category}，预算{budget}元左右，优先考虑{preference}",
]

PREFERENCE_TEXT = {
    "performance": "性能流畅",
    "battery": "续航持久",
    "portability": "轻便易携带",
    "display": "屏幕素质好",
    "camera": "拍照清晰",
    "audio": "音质和降噪好",
    "gaming": "游戏体验稳定",
    "office": "办公效率高",
    "connectivity": "连接稳定",
    "quality": "品质可靠",
}

USE_CASE_WEIGHTS = {
    "学习办公": {"office": 1.0, "battery": 0.8, "portability": 0.7, "display": 0.5},
    "编程开发": {"performance": 1.0, "office": 0.9, "display": 0.6, "battery": 0.5},
    "影音娱乐": {"display": 1.0, "audio": 0.9, "battery": 0.6, "performance": 0.4},
    "轻度游戏": {"gaming": 1.0, "performance": 0.9, "display": 0.7, "quality": 0.4},
    "内容创作": {"performance": 1.0, "display": 0.9, "camera": 0.6, "quality": 0.5},
    "差旅通勤": {"portability": 1.0, "battery": 0.95, "connectivity": 0.6, "quality": 0.4},
}


@dataclass(frozen=True)
class Scale:
    products_per_category: int = 120
    users: int = 2500
    queries: int = 8000
    candidates_per_query: int = 12
    reviews: int = 5000


def clip(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value))


def rounded_price(value: float) -> int:
    return max(99, int(round(value / 100.0) * 100 - 1))


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def generate_products(rng: random.Random, scale: Scale) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    index = 1
    for category, config in CATEGORY_CONFIG.items():
        low, high = config["price"]
        for local_index in range(scale.products_per_category):
            brand = BRANDS[(local_index + rng.randrange(len(BRANDS))) % len(BRANDS)]
            tier = rng.betavariate(2.0, 2.3)
            price = rounded_price(low + tier * (high - low) + rng.gauss(0, (high - low) * 0.035))
            specs = {feature: clip(0.24 + 0.58 * tier + rng.gauss(0, 0.13)) for feature in FEATURE_COLUMNS}
            for focus in config["focus"]:
                specs[focus] = clip(specs[focus] + rng.uniform(0.05, 0.2))
            rating = round(3.7 + 1.15 * specs["quality"] + rng.gauss(0, 0.13), 1)
            rating = clip(rating, 3.5, 5.0)
            sales_count = int(math.exp(rng.uniform(4.2, 9.0)) * (1.1 - tier * 0.42))
            review_count = max(8, int(sales_count * rng.uniform(0.04, 0.18)))
            release_days = rng.randint(10, 900)
            original_price = rounded_price(price * rng.uniform(1.03, 1.2))
            focus_ranked = sorted(config["focus"], key=lambda item: specs[item], reverse=True)
            highlights = "、".join(PREFERENCE_TEXT.get(key, key) for key in focus_ranked[:3])
            limitation = PREFERENCE_TEXT.get(min(config["focus"], key=lambda item: specs[item]), "配置均衡")
            model = f"{SERIES[local_index % len(SERIES)]} {10 + local_index % 89}"
            rows.append({
                "product_id": f"P{index:05d}",
                "category": category,
                "brand": brand,
                "name": f"{brand} {model}",
                "price": price,
                "original_price": original_price,
                "rating": round(rating, 1),
                "review_count": review_count,
                "sales_count": sales_count,
                "stock": rng.randint(20, 1800),
                **{name: round(value, 4) for name, value in specs.items()},
                "release_days": release_days,
                "description": f"面向{rng.choice(USE_CASES)}场景的{category}，主打{highlights}。",
                "highlights": highlights,
                "limitations": f"若特别在意{limitation}，建议对比同价位其他型号。",
            })
            index += 1
    return rows


def generate_users(rng: random.Random, scale: Scale) -> list[dict[str, Any]]:
    rows = []
    for index in range(1, scale.users + 1):
        rows.append({
            "user_id": f"U{index:05d}",
            "age_group": rng.choices(["18-24", "25-34", "35-44", "45+"], [0.34, 0.38, 0.2, 0.08])[0],
            "city_tier": rng.choices(["一线", "新一线", "二线", "三线及以下"], [0.25, 0.31, 0.27, 0.17])[0],
            "price_sensitivity": round(rng.betavariate(2.2, 2.0), 4),
            "preferred_brand": rng.choice(BRANDS),
            "preferred_category": rng.choice(list(CATEGORY_CONFIG)),
            "primary_use_case": rng.choice(USE_CASES),
            "created_at": (REFERENCE_TIME - timedelta(days=rng.randint(30, 900))).isoformat(),
        })
    return rows


def preference_vector(rng: random.Random, category: str, use_case: str, primary: str) -> dict[str, float]:
    weights = {feature: 0.08 for feature in FEATURE_COLUMNS}
    for feature, weight in USE_CASE_WEIGHTS[use_case].items():
        weights[feature] += weight
    weights[primary] += 1.25
    for focus in CATEGORY_CONFIG[category]["focus"]:
        weights[focus] += rng.uniform(0.03, 0.15)
    total = sum(weights.values())
    return {key: round(value / total, 5) for key, value in weights.items()}


def generate_queries_and_interactions(
    rng: random.Random,
    scale: Scale,
    products: list[dict[str, Any]],
    users: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    by_category = {
        category: [product for product in products if product["category"] == category]
        for category in CATEGORY_CONFIG
    }
    queries: list[dict[str, Any]] = []
    interactions: list[dict[str, Any]] = []
    user_map = {row["user_id"]: row for row in users}

    for query_index in range(1, scale.queries + 1):
        user = user_map[rng.choice(users)["user_id"]]
        category = rng.choices(
            list(CATEGORY_CONFIG),
            [0.27, 0.24, 0.16, 0.13, 0.12, 0.08],
        )[0]
        use_case = user["primary_use_case"] if rng.random() < 0.58 else rng.choice(USE_CASES)
        focus_options = CATEGORY_CONFIG[category]["focus"]
        primary = rng.choice(focus_options)
        low, high = CATEGORY_CONFIG[category]["price"]
        budget_position = clip(rng.betavariate(2.0, 2.2) * (1.15 - user["price_sensitivity"] * 0.2))
        budget_max = rounded_price(low + budget_position * (high - low)) + 1
        budget_min = max(0, rounded_price(budget_max * rng.uniform(0.55, 0.78)))
        prefs = preference_vector(rng, category, use_case, primary)
        query_text = rng.choice(QUERY_TEMPLATES).format(
            budget=budget_max,
            use_case=use_case,
            preference=PREFERENCE_TEXT[primary],
            category=category,
        )
        query_time = REFERENCE_TIME - timedelta(minutes=(scale.queries - query_index) * 30 + rng.randint(0, 20))
        split = "train" if query_index <= int(scale.queries * 0.70) else "validation" if query_index <= int(scale.queries * 0.85) else "test"
        query_id = f"Q{query_index:06d}"
        query_row = {
            "query_id": query_id,
            "user_id": user["user_id"],
            "query_text": query_text,
            "category": category,
            "use_case": use_case,
            "budget_min": budget_min,
            "budget_max": budget_max,
            "preferred_brand": user["preferred_brand"],
            "primary_preference": primary,
            **{f"pref_{feature}": prefs[feature] for feature in FEATURE_COLUMNS},
            "query_time": query_time.isoformat(),
            "split": split,
        }
        queries.append(query_row)

        scored_candidates = []
        for product in by_category[category]:
            price_ratio = product["price"] / max(budget_max, 1)
            budget_fit = math.exp(-2.5 * max(0.0, price_ratio - 1.0)) * math.exp(-0.35 * max(0.0, 0.48 - price_ratio))
            preference_fit = sum(prefs[feature] * product[feature] for feature in FEATURE_COLUMNS)
            brand_fit = 1.0 if product["brand"] == user["preferred_brand"] else 0.0
            latent = (
                0.35 * preference_fit
                + 0.29 * budget_fit
                + 0.11 * (product["rating"] / 5.0)
                + 0.07 * brand_fit
                + 0.06 * clip(math.log1p(product["sales_count"]) / 10.0)
                + 0.12 * product.get(primary, 0.5)
                + rng.gauss(0, 0.045)
            )
            scored_candidates.append((latent, product))
        scored_candidates.sort(key=lambda item: item[0], reverse=True)
        pool = scored_candidates[: max(22, scale.candidates_per_query)]
        exploratory = rng.sample(scored_candidates[22:], k=min(6, len(scored_candidates[22:])))
        selected = rng.sample(pool, k=scale.candidates_per_query - len(exploratory)) + exploratory

        displayed = []
        for latent, product in selected:
            marketplace_score = 0.58 * math.log1p(product["sales_count"]) / 10.0 + 0.22 * product["rating"] / 5.0 + 0.2 * latent + rng.gauss(0, 0.04)
            displayed.append((marketplace_score, latent, product))
        displayed.sort(key=lambda item: item[0], reverse=True)

        for position, (_, latent, product) in enumerate(displayed, start=1):
            if latent >= 0.73:
                relevance = 3
            elif latent >= 0.64:
                relevance = 2
            elif latent >= 0.54:
                relevance = 1
            else:
                relevance = 0
            position_bias = 1.05 / math.log2(position + 1)
            click_prob = sigmoid(-2.55 + 1.05 * relevance + 0.95 * position_bias)
            clicked = int(rng.random() < click_prob)
            cart_prob = sigmoid(-4.3 + 1.22 * relevance + 0.45 * clicked)
            added = int(clicked and rng.random() < cart_prob)
            purchase_prob = sigmoid(-5.1 + 1.38 * relevance + 0.8 * added)
            purchased = int(added and rng.random() < purchase_prob)
            dwell = 0 if not clicked else round(max(2.0, rng.gauss(12 + relevance * 16, 8)), 1)
            interactions.append({
                "interaction_id": f"I{len(interactions) + 1:08d}",
                "query_id": query_id,
                "user_id": user["user_id"],
                "product_id": product["product_id"],
                "position": position,
                "clicked": clicked,
                "added_to_cart": added,
                "purchased": purchased,
                "dwell_seconds": dwell,
                "relevance_grade": relevance,
                "event_time": (query_time + timedelta(seconds=position * 7 + rng.randint(0, 50))).isoformat(),
                "split": split,
            })
    return queries, interactions


def generate_reviews(rng: random.Random, scale: Scale, products: list[dict[str, Any]], users: list[dict[str, Any]]) -> list[dict[str, Any]]:
    positive = ["日常使用很流畅", "续航表现符合预期", "做工扎实", "屏幕观感不错", "连接稳定", "性价比可以"]
    balanced = ["整体满意，但仍有提升空间", "优点明显，也存在取舍", "适合特定场景，购买前建议对比", "功能够用，细节中规中矩"]
    rows = []
    for index in range(1, scale.reviews + 1):
        product = rng.choice(products)
        rating = rng.choices([3, 4, 5], [0.14, 0.42, 0.44])[0]
        text = rng.choice(positive if rating >= 4 else balanced)
        rows.append({
            "review_id": f"R{index:06d}",
            "product_id": product["product_id"],
            "user_id": rng.choice(users)["user_id"],
            "rating": rating,
            "review_text": f"{text}；{product['highlights']}方面体验较突出。",
            "helpful_votes": rng.randint(0, 180),
            "review_time": (REFERENCE_TIME - timedelta(days=rng.randint(1, 720))).isoformat(),
        })
    return rows


def build_sqlite(
    products: list[dict[str, Any]], users: list[dict[str, Any]], queries: list[dict[str, Any]],
    interactions: list[dict[str, Any]], reviews: list[dict[str, Any]],
) -> bool:
    if DB_PATH.exists():
        DB_PATH.unlink()
    connection = sqlite3.connect(DB_PATH)
    try:
        for table, rows in [
            ("products", products), ("users", users), ("queries", queries),
            ("interactions", interactions), ("reviews", reviews),
        ]:
            columns = list(rows[0].keys())
            column_sql = ", ".join(f'"{column}"' for column in columns)
            placeholders = ", ".join("?" for _ in columns)
            connection.execute(f'CREATE TABLE "{table}" ({column_sql})')
            connection.executemany(
                f'INSERT INTO "{table}" ({column_sql}) VALUES ({placeholders})',
                [[row[column] for column in columns] for row in rows],
            )
        connection.execute("CREATE INDEX idx_products_category_price ON products(category, price)")
        connection.execute("CREATE INDEX idx_queries_split ON queries(split, query_id)")
        connection.execute("CREATE INDEX idx_interactions_query ON interactions(query_id, product_id)")
        connection.execute("CREATE INDEX idx_interactions_split ON interactions(split, query_id)")
        connection.execute("CREATE INDEX idx_reviews_product ON reviews(product_id)")
        connection.execute(
            "CREATE TABLE experiments (experiment_id TEXT PRIMARY KEY, model_name TEXT, train_queries INTEGER, "
            "test_queries INTEGER, metrics_json TEXT, created_at TEXT)"
        )
        fts_enabled = True
        try:
            connection.execute("CREATE VIRTUAL TABLE product_fts USING fts5(product_id UNINDEXED, name, category, description, highlights, limitations, tokenize='unicode61')")
            connection.execute("INSERT INTO product_fts SELECT product_id, name, category, description, highlights, limitations FROM products")
        except sqlite3.OperationalError:
            fts_enabled = False
        connection.commit()
        return fts_enabled
    finally:
        connection.close()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quick", action="store_true", help="生成较小数据集，用于快速检查。")
    args = parser.parse_args()
    scale = Scale(products_per_category=24, users=300, queries=500, candidates_per_query=10, reviews=300) if args.quick else Scale()
    rng = random.Random(SEED)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

    products = generate_products(rng, scale)
    users = generate_users(rng, scale)
    queries, interactions = generate_queries_and_interactions(rng, scale, products, users)
    reviews = generate_reviews(rng, scale, products, users)

    files = {
        "products": DATA_DIR / "products.csv",
        "users": DATA_DIR / "users.csv",
        "queries": DATA_DIR / "queries.csv",
        "interactions": DATA_DIR / "interactions.csv",
        "reviews": DATA_DIR / "reviews.csv",
    }
    for key, path in files.items():
        write_csv(path, locals()[key])
    fts_enabled = build_sqlite(products, users, queries, interactions, reviews)

    manifest = {
        "project": "智选 Agent 合成电商数据集",
        "version": "1.0.0",
        "seed": SEED,
        "reference_time": REFERENCE_TIME.isoformat(),
        "synthetic_data": True,
        "license": "MIT（仅限本项目生成逻辑与合成数据）",
        "counts": {"products": len(products), "users": len(users), "queries": len(queries), "interactions": len(interactions), "reviews": len(reviews)},
        "splits": {name: sum(1 for row in queries if row["split"] == name) for name in ["train", "validation", "test"]},
        "sqlite_fts5": fts_enabled,
        "files": {path.name: {"sha256": sha256(path), "bytes": path.stat().st_size} for path in [*files.values(), DB_PATH]},
    }
    manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2)
    (DATA_DIR / "manifest.json").write_text(manifest_text, encoding="utf-8")
    (PUBLIC_DATA_DIR / "manifest.json").write_text(manifest_text, encoding="utf-8")
    print(json.dumps(manifest["counts"], ensure_ascii=False))
    print(f"SQLite: {DB_PATH}")


if __name__ == "__main__":
    main()
