#!/usr/bin/env python3
"""训练可解释的 pointwise 推荐排序模型并生成 Top-K 离线评估。"""

from __future__ import annotations

import json
import hashlib
import math
import sqlite3
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "generated"
MODEL_DIR = ROOT / "models"
REPORT_DIR = ROOT / "reports"
PUBLIC_DIR = ROOT / "public" / "data"
DB_PATH = ROOT / "data" / "zhixuan_ecommerce.db"

SPEC_FEATURES = ["performance", "battery", "portability", "display", "camera", "audio", "gaming", "office", "connectivity", "quality", "sustainability"]
FEATURES = [
    "log_price", "rating", "log_sales", "release_recency", "budget_fit", "brand_match",
    "use_case_fit", "primary_preference_fit", "preference_fit", *SPEC_FEATURES,
]

USE_CASE_MAP = {
    "学习办公": "office", "编程开发": "performance", "影音娱乐": "audio",
    "轻度游戏": "gaming", "内容创作": "display", "差旅通勤": "portability",
}


def load_frame() -> pd.DataFrame:
    products = pd.read_csv(DATA_DIR / "products.csv")
    queries = pd.read_csv(DATA_DIR / "queries.csv")
    interactions = pd.read_csv(DATA_DIR / "interactions.csv")
    frame = interactions.merge(queries, on=["query_id", "user_id", "split"], how="inner").merge(products, on="product_id", how="inner")
    frame["log_price"] = np.log1p(frame["price"])
    frame["log_sales"] = np.log1p(frame["sales_count"])
    frame["release_recency"] = np.exp(-frame["release_days"] / 720.0)
    ratio = frame["price"] / frame["budget_max"].clip(lower=1)
    frame["budget_fit"] = np.exp(-2.5 * np.maximum(0.0, ratio - 1.0)) * np.exp(-0.35 * np.maximum(0.0, 0.48 - ratio))
    frame["brand_match"] = (frame["brand"] == frame["preferred_brand"]).astype(float)
    frame["use_case_fit"] = [row[USE_CASE_MAP[row["use_case"]]] for _, row in frame.iterrows()]
    frame["primary_preference_fit"] = [row[row["primary_preference"]] for _, row in frame.iterrows()]
    preference_fit = np.zeros(len(frame))
    for feature in SPEC_FEATURES:
        preference_fit += frame[f"pref_{feature}"].to_numpy() * frame[feature].to_numpy()
    frame["preference_fit"] = preference_fit
    frame["is_relevant"] = (frame["relevance_grade"] >= 2).astype(int)
    return frame


def dcg(grades: np.ndarray, k: int) -> float:
    gains = np.power(2.0, grades[:k]) - 1.0
    discounts = np.log2(np.arange(2, len(gains) + 2))
    return float(np.sum(gains / discounts))


def evaluate(frame: pd.DataFrame, scores: np.ndarray, ks: tuple[int, ...] = (5, 10)) -> dict[str, float]:
    work = frame[["query_id", "relevance_grade"]].copy()
    work["score"] = scores
    collected: dict[str, list[float]] = {f"precision@{k}": [] for k in ks}
    collected.update({f"recall@{k}": [] for k in ks})
    collected.update({f"ndcg@{k}": [] for k in ks})
    reciprocal_ranks = []
    for _, group in work.groupby("query_id", sort=False):
        ranked = group.sort_values("score", ascending=False)
        grades = ranked["relevance_grade"].to_numpy(dtype=float)
        relevant = grades >= 2
        relevant_total = int(relevant.sum())
        if relevant_total:
            first = int(np.argmax(relevant)) + 1
            reciprocal_ranks.append(1.0 / first)
        else:
            reciprocal_ranks.append(0.0)
        ideal = np.sort(grades)[::-1]
        for k in ks:
            top = relevant[:k]
            collected[f"precision@{k}"].append(float(top.sum()) / k)
            collected[f"recall@{k}"].append(float(top.sum()) / relevant_total if relevant_total else 0.0)
            ideal_dcg = dcg(ideal, k)
            collected[f"ndcg@{k}"].append(dcg(grades, k) / ideal_dcg if ideal_dcg else 0.0)
    metrics = {key: round(float(np.mean(values)), 4) for key, values in collected.items()}
    metrics["mrr"] = round(float(np.mean(reciprocal_ranks)), 4)
    return metrics


def export_model(pipeline: Pipeline) -> dict[str, object]:
    scaler: StandardScaler = pipeline.named_steps["scale"]
    model: LogisticRegression = pipeline.named_steps["model"]
    coefficients = model.coef_[0]
    ranking = sorted(zip(FEATURES, coefficients), key=lambda item: abs(item[1]), reverse=True)
    return {
        "model_type": "pointwise_logistic_ranker",
        "objective": "商品达到相关等级 2 级及以上的概率",
        "features": FEATURES,
        "mean": scaler.mean_.round(8).tolist(),
        "scale": scaler.scale_.round(8).tolist(),
        "coefficients": coefficients.round(8).tolist(),
        "intercept": round(float(model.intercept_[0]), 8),
        "top_features": [{"name": name, "coefficient": round(float(value), 4)} for name, value in ranking[:8]],
    }


def predict_scores(pipeline: Pipeline, frame: pd.DataFrame) -> np.ndarray:
    """用导出的线性参数计算分数，确保 Python 与前端使用同一套公式。"""
    scaler: StandardScaler = pipeline.named_steps["scale"]
    model: LogisticRegression = pipeline.named_steps["model"]
    values = frame[FEATURES].to_numpy(dtype=np.float64, copy=True)
    scaled = (values - scaler.mean_) / scaler.scale_
    logits = np.einsum("ij,j->i", scaled, model.coef_[0]) + model.intercept_[0]
    positive = logits >= 0
    scores = np.empty_like(logits)
    scores[positive] = 1.0 / (1.0 + np.exp(-logits[positive]))
    exp_values = np.exp(logits[~positive])
    scores[~positive] = exp_values / (1.0 + exp_values)
    return scores


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    frame = load_frame()
    train = frame[frame["split"] == "train"].copy()
    validation = frame[frame["split"] == "validation"].copy()
    test = frame[frame["split"] == "test"].copy()

    pipeline = Pipeline([
        ("scale", StandardScaler()),
        ("model", LogisticRegression(
            C=0.8,
            class_weight="balanced",
            max_iter=1000,
            random_state=20260828,
            solver="liblinear",
        )),
    ])
    pipeline.fit(train[FEATURES], train["is_relevant"])
    validation_scores = predict_scores(pipeline, validation)
    test_scores = predict_scores(pipeline, test)
    popularity_scores = 0.72 * test["log_sales"].to_numpy() + 0.28 * test["rating"].to_numpy()
    price_scores = -np.abs(test["price"].to_numpy() / test["budget_max"].to_numpy() - 0.86)

    metrics = {
        "model": evaluate(test, test_scores),
        "popularity_baseline": evaluate(test, popularity_scores),
        "price_baseline": evaluate(test, price_scores),
        "validation": evaluate(validation, validation_scores),
        "dataset": {
            "train_queries": int(train["query_id"].nunique()),
            "validation_queries": int(validation["query_id"].nunique()),
            "test_queries": int(test["query_id"].nunique()),
            "train_rows": int(len(train)),
            "test_rows": int(len(test)),
            "positive_rate_train": round(float(train["is_relevant"].mean()), 4),
        },
    }
    model_json = export_model(pipeline)
    model_json["evaluation"] = metrics["model"]
    model_json["trained_on"] = metrics["dataset"]

    joblib.dump(pipeline, MODEL_DIR / "pointwise_ranker.joblib")
    (MODEL_DIR / "ranker.json").write_text(json.dumps(model_json, ensure_ascii=False, indent=2), encoding="utf-8")
    (REPORT_DIR / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    (PUBLIC_DIR / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    products = pd.read_csv(DATA_DIR / "products.csv")
    demo = products.sort_values(["category", "sales_count"], ascending=[True, False]).groupby("category", group_keys=False).head(40)
    demo_records = json.loads(demo.to_json(orient="records", force_ascii=False))
    (PUBLIC_DIR / "demo-products.json").write_text(json.dumps(demo_records, ensure_ascii=False, indent=2), encoding="utf-8")
    (PUBLIC_DIR / "ranker.json").write_text(json.dumps(model_json, ensure_ascii=False, indent=2), encoding="utf-8")

    test_output = test[["query_id", "product_id", "relevance_grade"]].copy()
    test_output["predicted_score"] = np.round(test_scores, 6)
    test_output.sort_values(["query_id", "predicted_score"], ascending=[True, False]).head(1200).to_csv(REPORT_DIR / "test_predictions_sample.csv", index=False, encoding="utf-8-sig")

    with sqlite3.connect(DB_PATH) as connection:
        connection.execute("DELETE FROM experiments WHERE experiment_id = ?", ("EXP-POINTWISE-V1",))
        connection.execute(
            "INSERT INTO experiments VALUES (?, ?, ?, ?, ?, ?)",
            ("EXP-POINTWISE-V1", "LogisticRegression pointwise ranker", metrics["dataset"]["train_queries"], metrics["dataset"]["test_queries"], json.dumps(metrics["model"], ensure_ascii=False), "2026-08-28T09:00:00+10:00"),
        )
        connection.commit()
    manifest_path = DATA_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["files"][DB_PATH.name] = {"sha256": file_sha256(DB_PATH), "bytes": DB_PATH.stat().st_size}
    manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2)
    manifest_path.write_text(manifest_text, encoding="utf-8")
    (PUBLIC_DIR / "manifest.json").write_text(manifest_text, encoding="utf-8")
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
