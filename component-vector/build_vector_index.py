#!/usr/bin/env python3
"""
构建组件变体向量索引，写入 Elasticsearch。

用法：
  python build_vector_index.py           # 真实 embedding API
  MOCK_EMBED=1 python build_vector_index.py  # mock 随机向量
"""

import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional

from config import (
    MOCK_MODE, EMBEDDING_BASE_URL, EMBEDDING_MODEL,
    COMPONENT_INDEX_PATH, ES_INDEX, REINDEX, EMBEDDING_DIM,
)
from es_client import get_client
from embed_client import embed_many

# ── 翻译表 ────────────────────────────────────────────────────────────────────

_TRANS_PATH = Path(__file__).parent / 'value_translations.json'
TRANSLATIONS: dict[str, str] = {
    k: v for k, v in json.loads(_TRANS_PATH.read_text()).items()
    if not k.startswith('_comment')
}

SKIP_KEYS = {
    '命名', '名称', '_iconName', '_spacing', 'innerMargin', 'line', 'linePositon',
    '_layer', '_number', '_version', '_picture', '_color', 'itemCol', 'columns',
    'starCount', 'number', 'data', 'options', '类型',
}


def _should_skip(key: str, val: str) -> bool:
    if key in SKIP_KEYS:
        return True
    if re.match(r'^ic_|^img_', val):
        return True
    if re.match(r'^\d+px$', val):
        return True
    if '_grid_' in val or re.match(r'^\d+-[A-Z]', val):
        return True
    if len(val) > 30:
        return True
    return False


def _translate_pair(key: str, val: str) -> str:
    exact = TRANSLATIONS.get(f'{key}={val}')
    if exact:
        return f'{val} {exact}'
    generic = TRANSLATIONS.get(val)
    if generic:
        return f'{val} {generic}'
    return val


def _variant_tokens(variant_name: str) -> str:
    tokens = []
    for part in variant_name.split(','):
        part = part.strip()
        eq = part.find('=')
        if eq < 0:
            continue
        key = part[:eq].strip()
        val = part[eq + 1:].strip()
        if _should_skip(key, val):
            continue
        tokens.append(_translate_pair(key, val))
    return ' '.join(tokens)


def _build_text(entry: dict, variant: Optional[dict]) -> str:
    name   = entry.get('name', '')
    canvas = re.sub(r'^\d+\.', '', entry.get('canvasName', '')).strip()
    tokens = _variant_tokens(variant['name']) if variant else ''
    return ' '.join(filter(None, [name, canvas, tokens]))


# ── 构建记录 ──────────────────────────────────────────────────────────────────

def build_records(data: dict) -> List[Dict]:
    records = []

    for entry in data.get('componentSets', []):
        path        = entry.get('hexFile', '')
        name        = entry.get('name', '')
        canvas_name = entry.get('canvasName', '')
        variants    = entry.get('variants') or []

        if not variants:
            records.append({
                'text':                   _build_text(entry, None),
                'symbol_id':              entry.get('guid') or entry.get('componentKey'),
                'variant_key':            entry.get('componentKey'),
                'component_set_key':      entry.get('componentKey'),
                'component_set_resolved': True,
                'path':                   path,
                'name':                   name,
                'canvas_name':            canvas_name,
                'variant_name':           '',
            })
        else:
            for variant in variants:
                records.append({
                    'text':                   _build_text(entry, variant),
                    'symbol_id':              variant.get('guid'),
                    'variant_key':            variant.get('variantKey'),
                    'component_set_key':      entry.get('componentKey'),
                    'component_set_resolved': True,
                    'path':                   path,
                    'name':                   name,
                    'canvas_name':            canvas_name,
                    'variant_name':           variant.get('name', ''),
                })

    for entry in data.get('standaloneComponents', []):
        records.append({
            'text':                   _build_text(entry, None),
            'symbol_id':              entry.get('guid') or entry.get('componentKey'),
            'variant_key':            entry.get('componentKey'),
            'component_set_key':      entry.get('componentKey'),
            'component_set_resolved': True,
            'path':                   entry.get('hexFile', ''),
            'name':                   entry.get('name', ''),
            'canvas_name':            entry.get('canvasName', ''),
            'variant_name':           '',
        })

    return records


# ── ES 操作 ───────────────────────────────────────────────────────────────────

ES_MAPPING = {
    'properties': {
        'text':                   {'type': 'text'},
        'embedding':              {'type': 'dense_vector', 'dims': EMBEDDING_DIM, 'index': True, 'similarity': 'cosine'},
        'symbol_id':              {'type': 'keyword'},
        'variant_key':            {'type': 'keyword'},
        'component_set_key':      {'type': 'keyword'},
        'component_set_resolved': {'type': 'boolean'},
        'path':                   {'type': 'keyword'},
        'name':                   {'type': 'keyword'},
        'canvas_name':            {'type': 'keyword'},
        'variant_name':           {'type': 'keyword'},
    }
}


def ensure_index(es):
    exists = es.indices.exists(index=ES_INDEX)
    if exists:
        if REINDEX:
            print(f'索引 {ES_INDEX} 已存在，追加模式（REINDEX=1）')
            return
        print(f'删除旧索引 {ES_INDEX} ...')
        es.indices.delete(index=ES_INDEX)
    print(f'创建索引 {ES_INDEX} ...')
    es.indices.create(index=ES_INDEX, mappings=ES_MAPPING)


def bulk_index(es, docs: List[Dict]):
    operations = []
    for doc in docs:
        operations.append({'index': {'_index': ES_INDEX}})
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
        print(f'无法连接 ES，请检查 ES_URL 配置', file=sys.stderr)
        sys.exit(1)
    print('ES 连接正常')

    data    = json.loads(Path(COMPONENT_INDEX_PATH).read_text())
    records = build_records(data)
    set_count = len(data.get('componentSets', [])) + len(data.get('standaloneComponents', []))
    print(f'共 {len(records)} 条记录（{set_count} 个组件/变体集）')

    print('\n--- embedding 文本预览 ---')
    for i, r in enumerate(records[:3]):
        print(f'[{i}] {r["text"][:100]}')
    print('...\n')

    ensure_index(es)

    BATCH_SIZE = 25
    ES_BULK    = 200
    embed_buf  = []
    total      = len(records)

    for i in range(0, total, BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        batch_no = i // BATCH_SIZE + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        print(f'Embed 批次 {batch_no}/{total_batches} ...', end=' ', flush=True)

        vecs = embed_many([r['text'] for r in batch])
        print('done')

        for rec, vec in zip(batch, vecs):
            embed_buf.append({**rec, 'embedding': vec})

        if len(embed_buf) >= ES_BULK or i + BATCH_SIZE >= total:
            bulk_index(es, embed_buf)
            embed_buf.clear()
            print(f'  → ES 写入至 {min(i + BATCH_SIZE, total)} 条')

    es.indices.refresh(index=ES_INDEX)
    count = es.count(index=ES_INDEX)['count']
    print(f'\n完成！ES 索引 {ES_INDEX} 共 {count} 条文档')


if __name__ == '__main__':
    main()
