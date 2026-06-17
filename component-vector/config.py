import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / '.env', override=False)

def _resolve(env_key, default_rel):
    val = os.environ.get(env_key, default_rel)
    if not os.path.isabs(val):
        val = str(Path(__file__).parent / val)
    return val

MOCK_MODE          = os.environ.get('MOCK_EMBED', '').lower() in ('1', 'true', 'yes')
EMBEDDING_BASE_URL = os.environ.get('EMBEDDING_BASE_URL', 'https://dashscope.aliyuncs.com/compatible-mode/v1').rstrip('/')
EMBEDDING_MODEL    = os.environ.get('EMBEDDING_MODEL', 'text-embedding-v3')
EMBEDDING_DIM      = int(os.environ.get('EMBEDDING_DIM', '1024'))
DASHSCOPE_API_KEY  = os.environ.get('DASHSCOPE_API_KEY', '')

ES_URL      = os.environ.get('ES_URL', 'http://localhost:9200')
ES_USERNAME = os.environ.get('ES_USERNAME', 'elastic')
ES_PASSWORD = os.environ.get('ES_PASSWORD', '')
ES_INDEX    = os.environ.get('ES_INDEX', 'component_variants')
ICON_ES_INDEX = os.environ.get('ICON_ES_INDEX', 'component_icons')

COMPONENT_INDEX_PATH = _resolve('COMPONENT_INDEX_PATH', '../component_index.json')
ICONS_PATH           = _resolve('ICONS_PATH', 'icons.json')

PORT    = int(os.environ.get('PORT', '3100'))
REINDEX = os.environ.get('REINDEX', '').lower() in ('1', 'true', 'yes')
