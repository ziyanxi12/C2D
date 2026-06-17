#!/usr/bin/env python3
"""
向量检索 HTTP API 服务。

启动：python server.py

POST /api/search/component        { "query": "主要按钮悬停", "topK": 3, "domain": "product-a" }
POST /api/search/component/batch  { "queries": ["...", "..."], "topK": 1, "domain": "product-a" }
POST /api/search/icon             { "query": "下载文件", "topK": 5 }
POST /api/search/icon/batch       { "queries": ["...", "..."], "topK": 1 }
GET  /api/search/domains          返回所有可用领域列表
"""

from flask import Flask, request, jsonify
from config import PORT
from vector_search import search_variant, search_variant_batch
from icon_search import search_icon, search_icon_batch
from es_client import list_domains

app = Flask(__name__)


def _top_k(body: dict, default: int = 5) -> int:
    return int(body.get('topK', default))


def _domain(body: dict):
    domain = body.get('domain')
    return str(domain) if domain else None


@app.route('/api/search/component', methods=['POST'])
def api_search_component():
    body  = request.get_json(force=True) or {}
    query = body.get('query')
    if not query:
        return jsonify({'error': 'query is required'}), 400
    results = search_variant(str(query), _top_k(body), _domain(body))
    return jsonify({'results': results})


@app.route('/api/search/component/batch', methods=['POST'])
def api_search_component_batch():
    body    = request.get_json(force=True) or {}
    queries = body.get('queries')
    if not isinstance(queries, list) or not queries:
        return jsonify({'error': 'queries must be a non-empty array'}), 400
    results = search_variant_batch([str(q) for q in queries], _top_k(body), _domain(body))
    return jsonify({'results': results})


@app.route('/api/search/icon', methods=['POST'])
def api_search_icon():
    body  = request.get_json(force=True) or {}
    query = body.get('query')
    if not query:
        return jsonify({'error': 'query is required'}), 400
    results = search_icon(str(query), _top_k(body))
    return jsonify({'results': results})


@app.route('/api/search/icon/batch', methods=['POST'])
def api_search_icon_batch():
    body    = request.get_json(force=True) or {}
    queries = body.get('queries')
    if not isinstance(queries, list) or not queries:
        return jsonify({'error': 'queries must be a non-empty array'}), 400
    results = search_icon_batch([str(q) for q in queries], _top_k(body))
    return jsonify({'results': results})


@app.route('/api/search/domains', methods=['GET'])
def api_list_domains():
    domains = list_domains()
    return jsonify({'domains': domains})


if __name__ == '__main__':
    print(f'向量检索服务启动，监听 http://localhost:{PORT}')
    print('  POST /api/search/component         { query, topK?, domain? }')
    print('  POST /api/search/component/batch   { queries, topK?, domain? }')
    print('  POST /api/search/icon              { query, topK? }')
    print('  POST /api/search/icon/batch        { queries, topK? }')
    print('  GET  /api/search/domains           返回所有可用领域')
    app.run(host='0.0.0.0', port=PORT)