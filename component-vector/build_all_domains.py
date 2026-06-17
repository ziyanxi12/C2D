#!/usr/bin/env python3
"""
一键构建所有领域的组件向量索引。

用法：
  python build_all_domains.py          # 构建所有领域
  python build_all_domains.py --rebuild  # 重建模式（先删除旧索引）
  
需要先配置 domains.yaml 文件。
"""

import argparse
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print('需要安装 PyYAML: pip install pyyaml', file=sys.stderr)
    sys.exit(1)

from config import DOMAINS_CONFIG_PATH


def load_domains():
    config_path = Path(DOMAINS_CONFIG_PATH)
    if not config_path.exists():
        print(f'配置文件不存在: {config_path}', file=sys.stderr)
        sys.exit(1)
    
    with open(config_path) as f:
        config = yaml.safe_load(f)
    
    domains = config.get('domains', [])
    if not domains:
        print('domains.yaml 中没有配置任何领域', file=sys.stderr)
        sys.exit(1)
    
    return domains


def build_domain(domain: dict, rebuild: bool = False):
    domain_id   = domain.get('id')
    domain_name = domain.get('name')
    data_path   = domain.get('data_path')
    
    if not domain_id or not domain_name:
        print(f'领域配置缺少 id 或 name: {domain}', file=sys.stderr)
        return False
    
    print(f'\n=== 构建领域: {domain_id} ({domain_name}) ===')
    
    cmd = [
        sys.executable,
        str(Path(__file__).parent / 'build_vector_index.py'),
        '--domain', domain_id,
        '--domain-name', domain_name,
    ]
    
    if data_path:
        cmd.extend(['--data', data_path])
    
    if rebuild:
        cmd.append('--rebuild')
    
    result = subprocess.run(cmd)
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(description='一键构建所有领域的组件向量索引')
    parser.add_argument('--rebuild', action='store_true', help='重建模式，先删除旧索引')
    parser.add_argument('--domain', help='只构建指定领域')
    args = parser.parse_args()
    
    domains = load_domains()
    
    if args.domain:
        domains = [d for d in domains if d.get('id') == args.domain]
        if not domains:
            print(f'未找到领域: {args.domain}', file=sys.stderr)
            sys.exit(1)
    
    success_count = 0
    for domain in domains:
        if build_domain(domain, args.rebuild):
            success_count += 1
    
    print(f'\n=== 完成 ===')
    print(f'成功构建 {success_count}/{len(domains)} 个领域')


if __name__ == '__main__':
    main()