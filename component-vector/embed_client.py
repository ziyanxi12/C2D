"""
Embedding 客户端 — 通过 POST 接口调用，支持 mock 模式。

真实调用：POST {EMBEDDING_BASE_URL}/embeddings
  Headers: Authorization: Bearer <key>, Content-Type: application/json
  Body:    { "model": "...", "input": [...], "dimensions": 1024, "encoding_format": "float" }
  Response:{ "data": [{ "index": 0, "embedding": [...] }, ...] }

Mock：直接返回随机单位向量，不发任何请求。
"""

import math
import random
import requests
from typing import List
from config import MOCK_MODE, EMBEDDING_BASE_URL, EMBEDDING_MODEL, EMBEDDING_DIM, DASHSCOPE_API_KEY

BATCH_LIMIT = 25  # DashScope 单批上限


def _mock_embedding():
    v = [random.uniform(-1, 1) for _ in range(EMBEDDING_DIM)]
    norm = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / norm for x in v]


def _call_api(texts: List[str]) -> List[List[float]]:
    url = f"{EMBEDDING_BASE_URL}/embeddings"
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model":           EMBEDDING_MODEL,
            "input":           texts,
            "dimensions":      EMBEDDING_DIM,
            "encoding_format": "float",
        },
        timeout=60,
    )
    resp.raise_for_status()
    items = sorted(resp.json()["data"], key=lambda x: x["index"])
    return [item["embedding"] for item in items]


def embed_batch(texts: List[str]) -> List[List[float]]:
    """单批（≤BATCH_LIMIT 条）embed，返回与 texts 等长的向量列表。"""
    if MOCK_MODE:
        return [_mock_embedding() for _ in texts]
    return _call_api(texts)


def embed_many(texts: List[str]) -> List[List[float]]:
    """超过 BATCH_LIMIT 时自动分批，返回与 texts 等长的向量列表。"""
    if not texts:
        return []
    result = []
    for i in range(0, len(texts), BATCH_LIMIT):
        result.extend(embed_batch(texts[i:i + BATCH_LIMIT]))
    return result
