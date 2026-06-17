#!/usr/bin/env python3
"""
构建图标向量索引，写入 Elasticsearch。

用法：
  python build_icon_index.py
  MOCK_EMBED=1 python build_icon_index.py
"""

import json
import re
import sys
from pathlib import Path
from typing import Dict, List

from config import (
    MOCK_MODE, EMBEDDING_BASE_URL, EMBEDDING_MODEL,
    ICONS_PATH, ICON_ES_INDEX, REINDEX, EMBEDDING_DIM,
)
from es_client import get_client
from embed_client import embed_many

# ── Embedding 文本构建 ────────────────────────────────────────────────────────

def _is_natural_language(s: str) -> bool:
    return bool(re.search(r'[一-鿿，。、\s]', s))


def _split_identifier(s: str) -> str:
    s = re.sub(r'^ic_', '', s)
    s = re.sub(r'([a-z])([A-Z])', r'\1 \2', s)
    return s.replace('_', ' ').strip()


def build_icon_text(icon: dict) -> str:
    parts = [icon.get('name', '')]

    en = icon.get('englishName', '')
    if en:
        parts.append(en if _is_natural_language(en) else _split_identifier(en))

    desc = icon.get('description', '')
    if desc:
        parts.append(desc if _is_natural_language(desc) else _split_identifier(desc))

    return ' '.join(filter(None, parts))


# ── ES 操作 ───────────────────────────────────────────────────────────────────

ES_MAPPING = {
    'properties': {
        'text':         {'type': 'text'},
        'embedding':    {'type': 'dense_vector', 'dims': EMBEDDING_DIM, 'index': True, 'similarity': 'cosine'},
        'icon_id':      {'type': 'keyword'},
        'name':         {'type': 'keyword'},
        'english_name': {'type': 'keyword'},
        'description':  {'type': 'text'},
    }
}


def ensure_index(es):
    exists = es.indices.exists(index=ICON_ES_INDEX)
    if exists:
        if REINDEX:
            print(f'索引 {ICON_ES_INDEX} 已存在，追加模式（REINDEX=1）')
            return
        print(f'删除旧索引 {ICON_ES_INDEX} ...')
        es.indices.delete(index=ICON_ES_INDEX)
    print(f'创建索引 {ICON_ES_INDEX} ...')
    es.indices.create(index=ICON_ES_INDEX, mappings=ES_MAPPING)


def bulk_index(es, docs: List[Dict]):
    operations = []
    for doc in docs:
        operations.append({'index': {'_index': ICON_ES_INDEX}})
        operations.append(doc)
    resp = es.bulk(operations=operations)
    if resp.get('errors'):
        failed = [item for item in resp['items'] if item.get('index', {}).get('error')]
        print(f'  ⚠ 本批有 {len(failed)} 条写入失败')


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    print('[MOCK 模式] 使用随机向量' if MOCK_MODE else f'[真实模式] {EMBEDDING_BASE_URL} / {EMBEDDING_MODEL}')

    es = get_client()
    if not es.ping():
        print('无法连接 ES，请检查 ES_URL 配置', file=sys.stderr)
        sys.exit(1)
    print('ES 连接正常')

    icons = json.loads(Path(ICONS_PATH).read_text())
    print(f'共 {len(icons)} 个图标')

    print('\n--- embedding 文本预览 ---')
    for i, icon in enumerate(icons[:3]):
        print(f'[{i}] {build_icon_text(icon)[:100]}')
    print('...\n')

    ensure_index(es)

    BATCH_SIZE = 25
    ES_BULK    = 200
    embed_buf  = []
    total      = len(icons)

    for i in range(0, total, BATCH_SIZE):
        batch = icons[i:i + BATCH_SIZE]
        batch_no = i // BATCH_SIZE + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        print(f'Embed 批次 {batch_no}/{total_batches} ...', end=' ', flush=True)

        texts = [build_icon_text(icon) for icon in batch]
        vecs  = embed_many(texts)
        print('done')

        for icon, text, vec in zip(batch, texts, vecs):
            embed_buf.append({
                'text':         text,
                'embedding':    vec,
                'icon_id':      icon.get('id', ''),
                'name':         icon.get('name', ''),
                'english_name': icon.get('englishName', ''),
                'description':  icon.get('description', ''),
            })

        if len(embed_buf) >= ES_BULK or i + BATCH_SIZE >= total:
            bulk_index(es, embed_buf)
            embed_buf.clear()
            print(f'  → ES 写入至 {min(i + BATCH_SIZE, total)} 条')

    es.indices.refresh(index=ICON_ES_INDEX)
    count = es.count(index=ICON_ES_INDEX)['count']
    print(f'\n完成！ES 索引 {ICON_ES_INDEX} 共 {count} 条文档')


if __name__ == '__main__':
    main()
