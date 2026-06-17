#!/usr/bin/env python3
"""
图标向量检索模块。

作为库：
  from icon_search import search_icon, search_icon_batch
  results = search_icon('下载文件', top_k=5)

CLI：
  python icon_search.py "下载图标" 5
  MOCK_EMBED=1 python icon_search.py "设置"
"""

import sys
from typing import Dict, List
from config import ICON_ES_INDEX, MOCK_MODE, EMBEDDING_MODEL
from es_client import get_client
from embed_client import embed_many

_SOURCE = ['icon_id', 'name', 'english_name', 'description']


def _hit_to_dict(hit: dict) -> dict:
    src = hit['_source']
    return {
        'score':        hit['_score'],
        'icon_id':      src.get('icon_id'),
        'name':         src.get('name'),
        'english_name': src.get('english_name'),
        'description':  src.get('description'),
    }


def search_icon(query: str, top_k: int = 5) -> List[Dict]:
    es  = get_client()
    vec = embed_many([query])[0]

    resp = es.search(
        index=ICON_ES_INDEX,
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


def search_icon_batch(queries: List[str], top_k: int = 5) -> List[List[Dict]]:
    if not queries:
        return []
    es   = get_client()
    vecs = embed_many(queries)

    searches = []
    for vec in vecs:
        searches.append({'index': ICON_ES_INDEX})
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
        print('用法: python icon_search.py "<查询>" [top_k]', file=sys.stderr)
        sys.exit(1)

    label = '[MOCK]' if MOCK_MODE else f'[{EMBEDDING_MODEL}]'
    print(f'查询: "{query}"  top_k={top_k}  {label}\n')

    for i, r in enumerate(search_icon(query, top_k)):
        print(f'#{i + 1}  score={r["score"]:.4f}')
        print(f'  icon_id:      {r["icon_id"]}')
        print(f'  name:         {r["name"]}')
        print(f'  english_name: {r["english_name"]}')
        print(f'  description:  {r["description"]}')
        print()
