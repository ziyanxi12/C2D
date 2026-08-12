# =============================================================================
# Stage 1: emcc 编译 C++ → WASM
# =============================================================================
FROM emscripten/emsdk:5.0.7 AS builder

WORKDIR /build/src
COPY src/ ./

# EMCC=emcc 覆盖 Makefile 中的本地硬编码路径
RUN make -f Makefile.wasm EMCC=emcc

# =============================================================================
# Stage 2: 运行时（Python + Node.js）
# 用 python:3.11-slim 做 base（Python 已内置），再装 Node.js + zip
# =============================================================================
FROM python:3.11-slim

# 换阿里云镜像源 + 安装 Node.js 18 和 zip
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null; \
    apt-get update && \
    apt-get install -y --no-install-recommends curl zip ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 拷贝 WASM 编译产物
COPY --from=builder /build/src/bin/ ./bin/

# 拷贝桥接层、API 服务、配置
COPY bridge/       ./bridge/
COPY api/          ./api/
COPY config.yaml   .
COPY package.json  .

# 安装 Python 依赖（换阿里云 PyPI）
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ \
    -r api/requirements.txt

EXPOSE 5000

# gunicorn 生产级 WSGI，--timeout 与 config.yaml timeout_sec 对齐
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "--timeout", "600", "api.app:app"]
