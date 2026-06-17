#!/usr/bin/env python3
"""
组件变体向量检索模块。

作为库：
  from vector_search import search_variant, search_variant_batch
  results = search_variant('主要按钮悬停状态', top_k=3)
  results = search_variant('主要按钮', top_k=3, domain='product-a')

CLI：
  python vector_search.py "主要按钮悬停" 3
  python vector_search.py "主要按钮" 3 --domain product-a
  MOCK_EMBED=1 python vector_search.py "文字链接 禁用"
"""

import argparse
import sys
from typing import Dict, List, Optional
from config import ES_INDEX, MOCK_MODE, EMBEDDING_MODEL
from es_client import get_client
from embed_client import embed_many

_SOURCE = [
    'domain', 'domain_name',
    'symbol_id', 'variant_key', 'component_set_key', 'component_set_resolved',
    'path', 'name', 'canvas_name', 'variant_name', 'text',
]


def _hit_to_dict(hit: dict) -> dict:
    src = hit['_source']
    return {
        'score':                  hit['_score'],
        'domain':                 src.get('domain'),
        'domain_name':            src.get('domain_name'),
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


def search_variant(query: str, top_k: int = 5, domain: Optional[str] = None) -> List[Dict]:
    es  = get_client()
    vec = embed_many([query])[0]

    knn_query = {
        'field':          'embedding',
        'query_vector':   vec,
        'k':              top_k,
        'num_candidates': max(top_k * 10, 50),
    }

    if domain:
        knn_query['filter'] = [{'term': {'domain': domain}}]

    resp = es.search(
        index=ES_INDEX,
        knn=knn_query,
        source=_SOURCE,
        size=top_k,
    )
    return [_hit_to_dict(h) for h in resp['hits']['hits']]


def search_variant_batch(queries: List[str], top_k: int = 5, domain: Optional[str] = None) -> List[List[Dict]]:
    """每个 query 独立返回 top_k 结果，返回与 queries 等长的二维列表。"""
    if not queries:
        return []
    es   = get_client()
    vecs = embed_many(queries)

    searches = []
    for vec in vecs:
        searches.append({'index': ES_INDEX})
        knn_query = {
            'field':          'embedding',
            'query_vector':   vec,
            'k':              top_k,
            'num_candidates': max(top_k * 10, 50),
        }
        if domain:
            knn_query['filter'] = [{'term': {'domain': domain}}]
        searches.append({
            'knn':    knn_query,
            'source': _SOURCE,
            'size':   top_k,
        })

    resp = es.msearch(searches=searches)
    return [
        [_hit_to_dict(h) for h in r['hits']['hits']]
        for r in resp['responses']
    ]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='组件变体向量检索')
    parser.add_argument('query', help='查询文本')
    parser.add_argument('top_k', type=int, nargs='?', default=5, help='返回数量')
    parser.add_argument('--domain', help='指定领域，如 product-a')
    args = parser.parse_args()

    label = '[MOCK]' if MOCK_MODE else f'[{EMBEDDING_MODEL}]'
    domain_label = f'  domain={args.domain}' if args.domain else ''
    print(f'查询: "{args.query}"  top_k={args.top_k}{domain_label}  {label}\n')

    for i, r in enumerate(search_variant(args.query, args.top_k, args.domain)):
        print(f'#{i + 1}  score={r["score"]:.4f}')
        print(f'  领域:               {r["domain"]} ({r["domain_name"]})')
        print(f'  名称:               {r["name"]}  [{r["canvas_name"]}]')
        print(f'  变体:               {r["variant_name"] or "(无变体)"}')
        print(f'  文本:               {r["_text"]}')
        print(f'  symbol_id:          {r["symbol_id"]}')
        print(f'  variant_key:        {r["variant_key"]}')
        print(f'  component_set_key:  {r["component_set_key"]}')
        print(f'  path:               {r["path"]}')
        print()