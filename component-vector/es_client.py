from elasticsearch import Elasticsearch
from config import ES_URL, ES_USERNAME, ES_PASSWORD

_client = None

def get_client() -> Elasticsearch:
    global _client
    if _client is None:
        kwargs = dict(hosts=ES_URL, verify_certs=False)
        if ES_USERNAME:
            kwargs['basic_auth'] = (ES_USERNAME, ES_PASSWORD)
        _client = Elasticsearch(**kwargs)
    return _client

def delete_index(index_name: str) -> bool:
    """删除指定 ES 索引。返回 True 表示删除成功，False 表示索引不存在。"""
    es = get_client()
    if es.indices.exists(index=index_name):
        es.indices.delete(index=index_name)
        print(f'已删除索引 {index_name}')
        return True
    print(f'索引 {index_name} 不存在')
    return False

def list_indices() -> list[str]:
    """列出所有 ES 索引名称。"""
    es = get_client()
    return list(es.indices.get(index='*').keys())
