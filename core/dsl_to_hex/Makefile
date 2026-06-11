CXX      = clang++
CC       = clang
CXXFLAGS = -std=c++17 -O2 -I../lib -I../lib/kiwi-master -I../lib/zstd-1.5.6/lib
CFLAGS   = -O2 -I../lib/zstd-1.5.6/lib -DZSTD_DISABLE_ASM

ZSTD_COMMON = \
	../lib/zstd-1.5.6/lib/common/debug.c \
	../lib/zstd-1.5.6/lib/common/entropy_common.c \
	../lib/zstd-1.5.6/lib/common/error_private.c \
	../lib/zstd-1.5.6/lib/common/fse_decompress.c \
	../lib/zstd-1.5.6/lib/common/pool.c \
	../lib/zstd-1.5.6/lib/common/threading.c \
	../lib/zstd-1.5.6/lib/common/xxhash.c \
	../lib/zstd-1.5.6/lib/common/zstd_common.c

ZSTD_DECOMP = \
	../lib/zstd-1.5.6/lib/decompress/huf_decompress.c \
	../lib/zstd-1.5.6/lib/decompress/zstd_ddict.c \
	../lib/zstd-1.5.6/lib/decompress/zstd_decompress.c \
	../lib/zstd-1.5.6/lib/decompress/zstd_decompress_block.c

ZSTD_COMP = \
	../lib/zstd-1.5.6/lib/compress/fse_compress.c \
	../lib/zstd-1.5.6/lib/compress/hist.c \
	../lib/zstd-1.5.6/lib/compress/huf_compress.c \
	../lib/zstd-1.5.6/lib/compress/zstd_compress.c \
	../lib/zstd-1.5.6/lib/compress/zstd_compress_literals.c \
	../lib/zstd-1.5.6/lib/compress/zstd_compress_sequences.c \
	../lib/zstd-1.5.6/lib/compress/zstd_compress_superblock.c \
	../lib/zstd-1.5.6/lib/compress/zstd_double_fast.c \
	../lib/zstd-1.5.6/lib/compress/zstd_fast.c \
	../lib/zstd-1.5.6/lib/compress/zstd_lazy.c \
	../lib/zstd-1.5.6/lib/compress/zstd_ldm.c \
	../lib/zstd-1.5.6/lib/compress/zstd_opt.c

ZSTD_SRCS = $(ZSTD_COMMON) $(ZSTD_DECOMP) $(ZSTD_COMP)
ZSTD_OBJS = $(ZSTD_SRCS:.c=.o)

BIN  = bin/dsl_to_hex
COMP = ../split_compset/harmony_out/component

all: bin $(BIN)

bin:
	mkdir -p bin

$(BIN): dsl_to_hex.cpp dsl_core.h $(ZSTD_OBJS)
	$(CXX) $(CXXFLAGS) -o $@ dsl_to_hex.cpp $(ZSTD_OBJS)

%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

# 测试当前DSL文件
test: $(BIN)
	$(BIN) test_data/login-design-dsl.json test_data/login_out.txt $(COMP)

clean:
	rm -f $(BIN) $(ZSTD_OBJS)

.PHONY: all bin test test-simple test-instance test-multi clean
