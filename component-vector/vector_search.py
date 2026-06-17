#!/usr/bin/env python3
"""
组件变体向量检索模块。

作为库：
  from vector_search import search_variant, search_variant_batch
  results = search_variant('主要按钮悬停状态', top_k=3)

CLI：
  python vector_search.py "主要按钮悬停" 3
  MOCK_EMBED=1 python vector_search.py "文字链接 禁用"
"""

import sys
from typing import Dict, List
from config import ES_INDEX, MOCK_MODE, EMBEDDING_MODEL
from es_client import get_client
from embed_client import embed_many

_SOURCE = [
    'symbol_id', 'variant_key', 'component_set_key', 'component_set_resolved',
    'path', 'name', 'canvas_name', 'variant_name', 'text',
]


def _hit_to_dict(hit: dict) -> dict:
    src = hit['_source']
    return {
        'score':                  hit['_score'],
        'symbol_id':              src.get('symbol_id'),
        'variant_key':            src.get('variant_key'),
        'component_set_key':      src.get('component_set_key'),
        'component_set_resolved': src.get('component_set_resolved'),
        'path':                   src.get('path'),
        'name':                   src.get('name'),
        'canvas_name':            src.get('canvas_name'),
        'variant_name':           src.get('variant_name'),
        '_text':                  src.get('text'),
    }


def search_variant(query: str, top_k: int = 1) -> List[Dict]:
    es  = get_client()
    vec = embed_many([query])[0]

    resp = es.search(
        index=ES_INDEX,
        knn={
            'field':          'embedding',
            'query_vector':   vec,
            'k':              top_k,
            'num_candidates': max(top_k * 10, 50),
        },
        source=_SOURCE,
        size=top_k,
    )
    return [_hit_to_dict(h) for h in resp['hits']['hits']]


def search_variant_batch(queries: List[str], top_k: int = 1) -> List[List[Dict]]:
    """每个 query 独立返回 top_k 结果，返回与 queries 等长的二维列表。"""
    if not queries:
        return []
    es   = get_client()
    vecs = embed_many(queries)

    searches = []
    for vec in vecs:
        searches.append({'index': ES_INDEX})
        searches.append({
            'knn':    {'field': 'embedding', 'query_vector': vec, 'k': top_k, 'num_candidates': max(top_k * 10, 50)},
            'source': _SOURCE,
            'size':   top_k,
        })

    resp = es.msearch(searches=searches)
    return [
        [_hit_to_dict(h) for h in r['hits']['hits']]
        for r in resp['responses']
    ]


if __name__ == '__main__':
    query = sys.argv[1] if len(sys.argv) > 1 else None
    top_k = int(sys.argv[2]) if len(sys.argv) > 2 else 5

    if not query:
        print('用法: python vector_search.py "<查询>" [top_k]', file=sys.stderr)
        sys.exit(1)

    label = '[MOCK]' if MOCK_MODE else f'[{EMBEDDING_MODEL}]'
    print(f'查询: "{query}"  top_k={top_k}  {label}\n')

    for i, r in enumerate(search_variant(query, top_k)):
        print(f'#{i + 1}  score={r["score"]:.4f}')
        print(f'  名称:               {r["name"]}  [{r["canvas_name"]}]')
        print(f'  变体:               {r["variant_name"] or "(无变体)"}')
        print(f'  文本:               {r["_text"]}')
        print(f'  symbol_id:          {r["symbol_id"]}')
        print(f'  variant_key:        {r["variant_key"]}')
        print(f'  component_set_key:  {r["component_set_key"]}')
        print(f'  path:               {r["path"]}')
        print()
