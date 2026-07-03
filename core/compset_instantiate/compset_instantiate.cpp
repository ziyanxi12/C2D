// compset_instantiate.cpp
// 读取 component_index.json + hex 组件集文件，为每个变体生成 INSTANCE 节点，输出 hex 文件
//
// Usage:
//   ./bin/compset_instantiate <component_index.json> <base_dir> <output.hex> [set_name...]
//
//   component_index.json  组件集索引（split_compset 生成）
//   base_dir              hexFile 字段的路径基准目录
//   output.hex            输出 hex 文件
//   [set_name...]         可选，过滤组件集名称；不传则处理全部

#define IMPLEMENT_KIWI_H
#define IMPLEMENT_SCHEMA_H

#include "kiwi.h"
#include "pixso.h"
#include "zstd.h"

// 复用 dsl_to_hex 所有模块（io_utils, pix_codec, comp_set, kiwi_utils,
// symbol_helpers, blob_helpers 等）
#include "../dsl_to_hex/dsl_core.h"

// =============================================================================
// 数据结构
// =============================================================================

struct VariantInfo {
    std::string name;
    uint32_t    guidS = 0, guidL = 0;
};

struct CompSetEntry {
    std::string              name;
    std::string              hexFile;   // 相对于 base_dir
    std::vector<VariantInfo> variants;
};

// =============================================================================
// 解析 component_index.json
// =============================================================================

static std::vector<CompSetEntry> parseIndex(const char *path) {
    auto raw = readFile(path);
    if (raw.empty()) return {};

    JsonParser jp((const char *)raw.data(), raw.size());
    JVal root = jp.parse();
    if (root.isNull()) {
        fprintf(stderr, "  [ERROR] JSON 解析失败: %s\n", path);
        return {};
    }

    std::vector<CompSetEntry> result;
    const JVal &sets = root.get("componentSets");
    for (size_t i = 0; i < sets.size(); i++) {
        const JVal &cs = sets[i];
        CompSetEntry entry;
        entry.name    = cs.get("name").asStr();
        entry.hexFile = cs.get("hexFile").asStr();

        const JVal &vars = cs.get("variants");
        for (size_t j = 0; j < vars.size(); j++) {
            const JVal &v = vars[j];
            VariantInfo vi;
            vi.name = v.get("name").asStr();
            auto gk = parseGK(v.get("guid").asStr());
            vi.guidS = gk.s;
            vi.guidL = gk.l;
            entry.variants.push_back(vi);
        }
        result.push_back(std::move(entry));
    }
    return result;
}

// =============================================================================
// 文件写入
// =============================================================================

static bool writeFile(const char *path, const std::vector<uint8_t> &d) {
    FILE *f = fopen(path, "wb");
    if (!f) { fprintf(stderr, "  [ERROR] 无法写入: %s\n", path); return false; }
    fwrite(d.data(), 1, d.size(), f);
    fclose(f);
    return true;
}

// =============================================================================
// 验证：重新解析生成的 pix 数据，打印摘要
// =============================================================================

static void verifyPix(const std::vector<uint8_t> &pixData, uint32_t expected) {
    size_t off = parsePixHeader(pixData);
    if (!off) { fprintf(stderr, "  verify: bad pix header\n"); return; }
    auto dec = decompressZstd(pixData.data() + off, pixData.size() - off);
    if (dec.empty()) { fprintf(stderr, "  verify: decompress failed\n"); return; }

    kiwi::ByteBuffer bb(dec.data(), dec.size());
    kiwi::MemoryPool vpool;
    PixsoMsg vmsg;
    if (!vmsg.decode(bb, vpool)) { fprintf(stderr, "  verify: kiwi decode failed\n"); return; }

    auto *nodes = vmsg.pixsoNodes();
    uint32_t cnt = nodes ? nodes->size() : 0;
    const char *ok = (cnt == expected) ? "OK" : "MISMATCH";
    printf("  [%s] 节点总数: %u (预期 %u)\n\n", ok, cnt, expected);

    if (!nodes) return;

    static const char *TNAME[] = {
        "?","NONE","DOC","CANVAS","GROUP","FRAME","BOOL","VEC",
        "STAR","LINE","ELLIPSE","RECT","REG","ROUND","TEXT","SLICE","SYMBOL","INSTANCE"
    };
    uint32_t show = std::min(cnt, 30u);
    for (uint32_t i = 0; i < show; i++) {
        const PixsoNode &n = (*nodes)[i];
        uint32_t t  = n.type() ? (uint32_t)*n.type() : 0;
        uint32_t gs = (n.guid() && n.guid()->sessionID()) ? *n.guid()->sessionID() : 0;
        uint32_t gl = (n.guid() && n.guid()->localID())   ? *n.guid()->localID()   : 0;
        const char *nm = n.name() ? n.name()->c_str() : "";
        bool internal = n.internalOnly() && *n.internalOnly();
        printf("  [%2u] %-8s guid={%u,%u}%s  \"%s\"\n",
               i, (t < 18 ? TNAME[t] : "?"), gs, gl,
               internal ? "[int]" : "", nm);
        if (n.symbolData() && n.symbolData()->symbolID()) {
            auto *sg = n.symbolData()->symbolID();
            printf("       symbolID={%u,%u}\n",
                   sg->sessionID() ? *sg->sessionID() : 0,
                   sg->localID()   ? *sg->localID()   : 0);
        }
        if (n.derivedSymbolData())
            printf("       derivedSymbolData: %u 条\n", (uint32_t)n.derivedSymbolData()->size());
    }
    if (cnt > show)
        printf("  ... 共 %u 个节点，仅显示前 %u 条\n", cnt, show);
}

// =============================================================================
// main
// =============================================================================

int main(int argc, char **argv) {
    if (argc < 4) {
        fprintf(stderr,
            "Usage: %s <component_index.json> <base_dir> <output.hex> [set_name...]\n\n"
            "  component_index.json  组件集索引（split_compset 输出）\n"
            "  base_dir              hexFile 路径的基准目录\n"
            "  output.hex            输出 hex 文件\n"
            "  [set_name...]         可选，过滤组件集名称；不传则处理全部\n\n"
            "Example:\n"
            "  %s component_index.json wasm_test_out out.hex \"文字链接\"\n",
            argv[0], argv[0]);
        return 1;
    }

    const char *indexPath  = argv[1];
    const char *baseDir    = argv[2];
    const char *outputPath = argv[3];

    std::set<std::string> nameFilter;
    for (int i = 4; i < argc; i++) nameFilter.insert(argv[i]);

    printf("=== compset_instantiate ===\n");
    printf("  index : %s\n", indexPath);
    printf("  base  : %s\n", baseDir);
    printf("  output: %s\n", outputPath);
    if (!nameFilter.empty()) {
        printf("  filter:");
        for (auto &n : nameFilter) printf(" \"%s\"", n.c_str());
        printf("\n");
    }
    printf("\n");

    // ── 1. 解析索引 ──────────────────────────────────────────────────────────
    auto allEntries = parseIndex(indexPath);
    if (allEntries.empty()) {
        fprintf(stderr, "  [ERROR] 索引解析失败或为空\n");
        return 1;
    }
    printf("  索引条目: %zu 个组件集\n", allEntries.size());

    // ── 2. 按名称过滤 ────────────────────────────────────────────────────────
    std::vector<CompSetEntry *> selected;
    for (auto &e : allEntries) {
        if (nameFilter.empty() || nameFilter.count(e.name))
            selected.push_back(&e);
    }
    if (selected.empty()) {
        fprintf(stderr, "  [ERROR] 没有匹配的组件集\n");
        return 1;
    }
    printf("  选中: %zu 个组件集\n\n", selected.size());

    // ── 3. 加载 hex 文件 ─────────────────────────────────────────────────────
    std::vector<std::unique_ptr<CompSetData>> compSets;
    std::map<CompSetEntry *, CompSetData *>   entryToCS;

    for (auto *entry : selected) {
        std::string hexPath = std::string(baseDir) + "/" + entry->hexFile;
        auto cs = std::make_unique<CompSetData>();
        if (!loadCompSet(hexPath.c_str(), *cs)) {
            fprintf(stderr, "  [ERROR] 加载失败: %s\n", hexPath.c_str());
            continue;
        }
        auto *nodes = cs->msg.pixsoNodes();
        printf("  组件集 \"%s\": %u 节点, %zu 变体\n",
               entry->name.c_str(),
               nodes ? nodes->size() : 0u,
               entry->variants.size());
        entryToCS[entry] = cs.get();
        compSets.push_back(std::move(cs));
    }
    if (compSets.empty()) {
        fprintf(stderr, "  [ERROR] 没有成功加载的组件集\n");
        return 1;
    }
    printf("\n");

    // ── 4. 建 SymbolMap 和 ChildrenMap ───────────────────────────────────────
    // GUID 字符串 → (CompSetData*, SYMBOL PixsoNode*)
    std::map<std::string, std::pair<CompSetData *, const PixsoNode *>> symMap;
    std::map<CompSetData *, ChildrenMap> childMaps;

    for (auto &cs : compSets) {
        childMaps[cs.get()] = buildChildrenMap(*cs);
        auto *nodes = cs->msg.pixsoNodes();
        if (!nodes) continue;
        for (uint32_t i = 0; i < nodes->size(); i++) {
            const PixsoNode &n = (*nodes)[i];
            if (!n.type() || *n.type() != NodeType::SYMBOL || !n.guid()) continue;
            uint32_t s = n.guid()->sessionID() ? *n.guid()->sessionID() : 0;
            uint32_t l = n.guid()->localID()   ? *n.guid()->localID()   : 0;
            symMap[gkStr(s, l)] = {cs.get(), &n};
        }
    }
    printf("  SYMBOL 节点总数: %zu\n", symMap.size());

    // ── 5. 按 component_index 变体列表收集待实例化任务 ───────────────────────
    struct InstTask {
        std::string      variantName;
        uint32_t         symS, symL;      // SYMBOL GUID
        const PixsoNode *symNode;
        const ChildrenMap *cm;
    };
    std::vector<InstTask> tasks;

    for (auto *entry : selected) {
        auto csIt = entryToCS.find(entry);
        if (csIt == entryToCS.end()) continue;
        CompSetData *cs = csIt->second;
        auto cmIt = childMaps.find(cs);

        for (auto &vi : entry->variants) {
            auto smIt = symMap.find(gkStr(vi.guidS, vi.guidL));
            if (smIt == symMap.end()) {
                fprintf(stderr, "  [WARN] 变体 \"%s\" guid={%u,%u} 未在 hex 中找到，跳过\n",
                        vi.name.c_str(), vi.guidS, vi.guidL);
                continue;
            }
            InstTask t;
            t.variantName = vi.name;
            t.symS        = vi.guidS;
            t.symL        = vi.guidL;
            t.symNode     = smIt->second.second;
            t.cm          = (cmIt != childMaps.end()) ? &cmIt->second : nullptr;
            tasks.push_back(t);
        }
    }

    if (tasks.empty()) {
        fprintf(stderr, "  [ERROR] 没有可实例化的变体\n");
        return 1;
    }
    printf("  待实例化变体: %zu 个\n\n", tasks.size());

    // ── 6. 计算 DSL session（比所有组件集最大 session 大 1）─────────────────
    uint32_t maxSess = 1;
    for (auto &cs : compSets) {
        auto *nodes = cs->msg.pixsoNodes();
        if (!nodes) continue;
        for (uint32_t i = 0; i < nodes->size(); i++) {
            const PixsoNode &n = (*nodes)[i];
            if (n.guid() && n.guid()->sessionID())
                maxSess = std::max(maxSess, *n.guid()->sessionID());
        }
    }
    GuidCounter gc;
    gc.session = maxSess + 1;
    gc.local   = 0;
    printf("  DSL GUID session: %u\n", gc.session);

    // ── 7. 合并 blobs（各组件集的 blob 顺序拼接，建重映射表）────────────────
    std::vector<std::vector<uint8_t>>                 mergedBlobs;
    std::map<CompSetData *, std::map<int32_t,int32_t>> blobRemaps;

    for (auto &cs : compSets) {
        auto *blobs = cs->msg.blobs();
        if (!blobs || blobs->size() == 0) continue;
        auto   &remap  = blobRemaps[cs.get()];
        int32_t offset = (int32_t)mergedBlobs.size();
        for (uint32_t i = 0; i < blobs->size(); i++) {
            remap[(int32_t)i] = offset + (int32_t)i;
            const auto *bytes = (*blobs)[i].bytes();
            if (bytes && bytes->size() > 0)
                mergedBlobs.push_back(
                    std::vector<uint8_t>(&(*bytes)[0], &(*bytes)[0] + bytes->size()));
            else
                mergedBlobs.push_back({});
        }
    }
    if (!mergedBlobs.empty())
        printf("  merged blobs: %zu 条\n", mergedBlobs.size());

    // ── 8. 统计去重后的 compset 节点数（与写入逻辑保持一致：跳过 CANVAS）────
    uint32_t compNodeCount = 0;
    {
        std::set<std::string> seenGuids;
        for (auto &cs : compSets) {
            auto *nodes = cs->msg.pixsoNodes();
            if (!nodes) continue;
            for (uint32_t i = 0; i < nodes->size(); i++) {
                const PixsoNode &n = (*nodes)[i];
                if (n.type() && *n.type() == NodeType::CANVAS) continue;
                uint32_t s = (n.guid() && n.guid()->sessionID()) ? *n.guid()->sessionID() : 0;
                uint32_t l = (n.guid() && n.guid()->localID())   ? *n.guid()->localID()   : 0;
                if (seenGuids.insert(gkStr(s, l)).second) compNodeCount++;
            }
        }
    }

    uint32_t N     = (uint32_t)tasks.size();
    uint32_t total = 1 + N + 1 + compNodeCount;
    // 1 可见CANVAS + N INSTANCE + 1 隐藏CANVAS + compset 节点
    printf("  节点规划: 1(canvas) + %u(instances) + 1(hidden_canvas) + %u(compset) = %u\n\n",
           N, compNodeCount, total);

    // ── 9. 构建 PixsoMsg ─────────────────────────────────────────────────────
    kiwi::MemoryPool pool;
    PixsoMsg out;
    out.set_type(PixsoMsgType::FIC_DOCUMENT);
    auto &arr = out.set_pixsoNodes(pool, total);
    uint32_t idx = 0;

    // 可见 CANVAS {0,1}
    {
        PixsoNode &cv = arr[idx++];
        cv.set_type(NodeType::CANVAS);
        cv.set_phase(NodePhase::CREATED);
        cv.set_guid(makeGUID(pool, 0, 1));
        cv.set_name(pool.string("组件实例预览"));
        cv.set_parentIndex(makeParent(pool, 0, 0, "!"));
    }

    // INSTANCE 节点：网格排布，4 列，列宽/行高取所有变体的最大尺寸
    const int   COLS = 4;
    const float GAP  = 20.0f;

    float maxW = 10.0f, maxH = 10.0f;
    for (auto &t : tasks) {
        if (t.symNode->size()) {
            if (t.symNode->size()->x() && *t.symNode->size()->x() > 0)
                maxW = std::max(maxW, *t.symNode->size()->x());
            if (t.symNode->size()->y() && *t.symNode->size()->y() > 0)
                maxH = std::max(maxH, *t.symNode->size()->y());
        }
    }

    for (uint32_t ti = 0; ti < N; ti++) {
        const InstTask &t    = tasks[ti];
        auto [nodeS, nodeL]  = gc.next();

        PixsoNode &n = arr[idx++];
        n.set_type(NodeType::INSTANCE);
        n.set_phase(NodePhase::CREATED);
        n.set_guid(makeGUID(pool, nodeS, nodeL));
        n.set_name(pool.string(t.variantName.c_str()));
        n.set_visible(true);
        n.set_parentIndex(makeParent(pool, 0, 1, makePos((int)ti)));

        // 网格位置：列优先
        float x = (float)(ti % COLS) * (maxW + GAP);
        float y = (float)(ti / COLS) * (maxH + GAP);
        Matrix *mat = pool.allocate<Matrix>(); new(mat) Matrix();
        mat->set_m00(1.f); mat->set_m01(0.f); mat->set_m02(x);
        mat->set_m10(0.f); mat->set_m11(1.f); mat->set_m12(y);
        n.set_transform(mat);

        // 尺寸：从 SYMBOL 读取，否则用全局最大值
        float w = maxW, h = maxH;
        if (t.symNode->size()) {
            if (t.symNode->size()->x() && *t.symNode->size()->x() > 0)
                w = *t.symNode->size()->x();
            if (t.symNode->size()->y() && *t.symNode->size()->y() > 0)
                h = *t.symNode->size()->y();
        }
        Vector *sz = pool.allocate<Vector>(); new(sz) Vector();
        sz->set_x(w); sz->set_y(h);
        n.set_size(sz);

        // symbolData → symbolID 指向对应 SYMBOL 的 GUID
        SymbolData *sd = pool.allocate<SymbolData>(); new(sd) SymbolData();
        sd->set_symbolID(makeGUID(pool, t.symS, t.symL));
        n.set_symbolData(sd);

        // derivedSymbolData：递归填充后代节点的 guidPath（Pixso 靠此定位后代）
        if (t.cm) {
            uint32_t cnt = computeDerivedCount(*t.symNode, *t.cm);
            if (cnt > 0) {
                auto &dsd = n.set_derivedSymbolData(pool, cnt);
                uint32_t dsdIdx = 0;
                std::vector<std::pair<uint32_t,uint32_t>> path;
                fillDerivedSlots(pool, dsd, dsdIdx, *t.symNode, *t.cm, path);
            }
        }
    }

    // 隐藏 CANVAS {0,2}（compset 孤根节点的挂载点）
    {
        PixsoNode &hv = arr[idx++];
        hv.set_type(NodeType::CANVAS);
        hv.set_phase(NodePhase::CREATED);
        hv.set_guid(makeGUID(pool, 0, 2));
        hv.set_name(pool.string("Internal Only Canvas"));
        hv.set_internalOnly(true);
        hv.set_parentIndex(makeParent(pool, 0, 0, "~"));
    }

    // compset 全量节点（全局 GUID 去重，跳过 CANVAS，孤根改挂 {0,2}）
    {
        std::set<std::string> writtenGuids;
        for (auto &cs : compSets) {
            auto *nodes = cs->msg.pixsoNodes();
            if (!nodes) continue;
            uint32_t M = nodes->size();

            // 本组件集内非 CANVAS 节点的 GUID 集合（用于孤根判断）
            std::set<std::pair<uint32_t,uint32_t>> guidSet;
            for (uint32_t i = 0; i < M; i++) {
                const PixsoNode &n = (*nodes)[i];
                if (n.type() && *n.type() == NodeType::CANVAS) continue;
                if (n.guid() && n.guid()->sessionID() && n.guid()->localID())
                    guidSet.insert({*n.guid()->sessionID(), *n.guid()->localID()});
            }

            auto brmIt = blobRemaps.find(cs.get());
            const std::map<int32_t,int32_t> *csRemap =
                (brmIt != blobRemaps.end() && !brmIt->second.empty())
                ? &brmIt->second : nullptr;

            for (uint32_t i = 0; i < M; i++) {
                const PixsoNode &orig = (*nodes)[i];
                if (orig.type() && *orig.type() == NodeType::CANVAS) continue;

                uint32_t gs = (orig.guid() && orig.guid()->sessionID()) ? *orig.guid()->sessionID() : 0;
                uint32_t gl = (orig.guid() && orig.guid()->localID())   ? *orig.guid()->localID()   : 0;
                if (!writtenGuids.insert(gkStr(gs, gl)).second) continue;  // 全局去重

                // 孤根（parent 不在本组件集内）→ 改挂到隐藏页 {0,2}
                bool parentInSet = false;
                if (orig.parentIndex() && orig.parentIndex()->guid()) {
                    auto *pg = orig.parentIndex()->guid();
                    uint32_t ps = pg->sessionID() ? *pg->sessionID() : 0;
                    uint32_t pl = pg->localID()   ? *pg->localID()   : 0;
                    parentInSet = guidSet.count({ps, pl}) > 0;
                }

                arr[idx] = orig;
                if (!parentInSet)
                    arr[idx].set_parentIndex(makeParent(pool, 0, 2, "a0"));
                if (csRemap)
                    remapBlobsInNode(arr[idx], *csRemap);
                idx++;
            }
        }
    }

    if (idx != total)
        fprintf(stderr, "  [ERROR] 节点计数不一致: 预期 %u，实际 %u\n", total, idx);

    // blobs 写入（必须在 encode 之前）
    if (!mergedBlobs.empty()) {
        auto &outBlobs = out.set_blobs(pool, (uint32_t)mergedBlobs.size());
        for (size_t i = 0; i < mergedBlobs.size(); i++) {
            if (!mergedBlobs[i].empty()) {
                auto &dstB = outBlobs[i].set_bytes(pool, (uint32_t)mergedBlobs[i].size());
                for (size_t j = 0; j < mergedBlobs[i].size(); j++)
                    dstB[j] = mergedBlobs[i][j];
            }
        }
    }

    // ── 10. 编码 → 压缩 → hex → 写文件 ──────────────────────────────────────
    kiwi::ByteBuffer bb;
    if (!out.encode(bb)) { fprintf(stderr, "  [ERROR] kiwi encode 失败\n"); return 1; }
    printf("  kiwi 编码大小: %zu bytes\n", bb.size());

    std::vector<uint8_t> kiwiBin(bb.data(), bb.data() + bb.size());
    auto pixData = compressToPix(kiwiBin);
    if (pixData.empty()) return 1;
    printf("  pix 大小: %zu bytes\n", pixData.size());

    std::string hexStr = bytesToHex(pixData);
    std::string outStr = "<!-- pixso binary data -->\n" + hexStr;
    std::vector<uint8_t> outBytes(outStr.begin(), outStr.end());
    if (!writeFile(outputPath, outBytes)) return 1;
    printf("  已写入: %s  (%zu hex chars)\n\n", outputPath, hexStr.size());

    // ── 11. 验证（重新解析） ──────────────────────────────────────────────────
    printf("=== 验证（重新解析）===\n");
    verifyPix(pixData, total);

    return 0;
}
