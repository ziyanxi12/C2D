// compset_instantiate_wasm.cpp
// WASM 导出入口：从 component_index.json + hex 组件集生成变体实例 hex 文件
//
// NODERAWFS=1：fopen/fread/fwrite 直接路由 Node.js fs，无需虚拟文件系统

#define IMPLEMENT_KIWI_H
#define IMPLEMENT_SCHEMA_H

#include "kiwi.h"
#include "pixso.h"
#include "zstd.h"

#include <emscripten/bind.h>

#include "../dsl_to_hex/dsl_core.h"

// =============================================================================
// 数据结构（与 compset_instantiate.cpp 相同）
// =============================================================================

struct VariantInfo {
    std::string name;
    uint32_t    guidS = 0, guidL = 0;
};

struct CompSetEntry {
    std::string              name;
    std::string              hexFile;
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
    if (root.isNull()) return {};

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
// JSON 工具
// =============================================================================

static std::string jsonStr(const std::string &s) {
    std::string out = "\"";
    for (char c : s) {
        if      (c == '"')  out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else if (c == '\n') out += "\\n";
        else                out += c;
    }
    return out + "\"";
}

static std::string errJson(const std::string &msg) {
    return "{\"error\":" + jsonStr(msg) + "}";
}

// =============================================================================
// WASM 导出函数
//
// instantiateCompSet(indexPath, baseDir, setNames) → hexString | errorJSON
//
//   indexPath : component_index.json 的绝对路径
//   baseDir   : hexFile 的基准目录（通常是 index 所在目录的父目录）
//   setNames  : 逗号分隔的组件集名称（空字符串 = 全部）
//
// 返回：
//   成功: "<!-- pixso binary data -->\n<hex>"
//   失败: {"error":"...","variants":N,"nodes":N}   （JSON，以 { 开头）
// =============================================================================

std::string instantiateCompSet(const std::string &indexPath,
                               const std::string &baseDir,
                               const std::string &setNames) {
    if (indexPath.empty()) return errJson("indexPath is empty");

    // 解析名称过滤列表（逗号分隔）
    std::set<std::string> nameFilter;
    if (!setNames.empty()) {
        std::string cur;
        for (char c : setNames) {
            if (c == ',') { if (!cur.empty()) { nameFilter.insert(cur); cur.clear(); } }
            else            cur += c;
        }
        if (!cur.empty()) nameFilter.insert(cur);
    }

    // 1. 解析索引
    auto allEntries = parseIndex(indexPath.c_str());
    if (allEntries.empty()) return errJson("failed to parse index: " + indexPath);

    // 2. 过滤
    std::vector<CompSetEntry *> selected;
    for (auto &e : allEntries)
        if (nameFilter.empty() || nameFilter.count(e.name))
            selected.push_back(&e);
    if (selected.empty()) return errJson("no matching component sets");

    // 3. 加载 hex 文件
    std::vector<std::unique_ptr<CompSetData>> compSets;
    std::map<CompSetEntry *, CompSetData *>   entryToCS;
    std::string bd = baseDir;
    if (!bd.empty() && bd.back() != '/') bd += '/';

    for (auto *entry : selected) {
        std::string hexPath = bd + entry->hexFile;
        auto cs = std::make_unique<CompSetData>();
        if (!loadCompSet(hexPath.c_str(), *cs)) {
            fprintf(stderr, "[WARN] 加载失败: %s\n", hexPath.c_str());
            continue;
        }
        entryToCS[entry] = cs.get();
        compSets.push_back(std::move(cs));
    }
    if (compSets.empty()) return errJson("no component sets loaded");

    // 4. 建 SymbolMap 和 ChildrenMap
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

    // 5. 收集待实例化任务
    struct InstTask {
        std::string       variantName;
        uint32_t          symS, symL;
        const PixsoNode  *symNode;
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
            if (smIt == symMap.end()) continue;
            InstTask t;
            t.variantName = vi.name;
            t.symS        = vi.guidS;
            t.symL        = vi.guidL;
            t.symNode     = smIt->second.second;
            t.cm          = (cmIt != childMaps.end()) ? &cmIt->second : nullptr;
            tasks.push_back(t);
        }
    }
    if (tasks.empty()) return errJson("no variants to instantiate");

    // 6. DSL session（max compset session + 1）
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

    // 7. 合并 blobs
    std::vector<std::vector<uint8_t>>                  mergedBlobs;
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

    // 8. 统计 compset 节点（全局去重，跳过 CANVAS）
    uint32_t compNodeCount = 0;
    {
        std::set<std::string> seen;
        for (auto &cs : compSets) {
            auto *nodes = cs->msg.pixsoNodes();
            if (!nodes) continue;
            for (uint32_t i = 0; i < nodes->size(); i++) {
                const PixsoNode &n = (*nodes)[i];
                if (n.type() && *n.type() == NodeType::CANVAS) continue;
                uint32_t s = (n.guid() && n.guid()->sessionID()) ? *n.guid()->sessionID() : 0;
                uint32_t l = (n.guid() && n.guid()->localID())   ? *n.guid()->localID()   : 0;
                if (seen.insert(gkStr(s, l)).second) compNodeCount++;
            }
        }
    }

    uint32_t N     = (uint32_t)tasks.size();
    uint32_t total = 1 + N + 1 + compNodeCount;

    // 9. 构建 PixsoMsg
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

    // INSTANCE 节点（4 列网格，统一步长 = max 尺寸 + 20px 间距）
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
        const InstTask &t   = tasks[ti];
        auto [nodeS, nodeL] = gc.next();

        PixsoNode &n = arr[idx++];
        n.set_type(NodeType::INSTANCE);
        n.set_phase(NodePhase::CREATED);
        n.set_guid(makeGUID(pool, nodeS, nodeL));
        n.set_name(pool.string(t.variantName.c_str()));
        n.set_visible(true);
        n.set_parentIndex(makeParent(pool, 0, 1, makePos((int)ti)));

        float x = (float)(ti % COLS) * (maxW + GAP);
        float y = (float)(ti / COLS) * (maxH + GAP);
        Matrix *mat = pool.allocate<Matrix>(); new(mat) Matrix();
        mat->set_m00(1.f); mat->set_m01(0.f); mat->set_m02(x);
        mat->set_m10(0.f); mat->set_m11(1.f); mat->set_m12(y);
        n.set_transform(mat);

        float w = maxW, h = maxH;
        if (t.symNode->size()) {
            if (t.symNode->size()->x() && *t.symNode->size()->x() > 0) w = *t.symNode->size()->x();
            if (t.symNode->size()->y() && *t.symNode->size()->y() > 0) h = *t.symNode->size()->y();
        }
        Vector *sz = pool.allocate<Vector>(); new(sz) Vector();
        sz->set_x(w); sz->set_y(h);
        n.set_size(sz);

        SymbolData *sd = pool.allocate<SymbolData>(); new(sd) SymbolData();
        sd->set_symbolID(makeGUID(pool, t.symS, t.symL));
        n.set_symbolData(sd);

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

    // 隐藏 CANVAS {0,2}
    {
        PixsoNode &hv = arr[idx++];
        hv.set_type(NodeType::CANVAS);
        hv.set_phase(NodePhase::CREATED);
        hv.set_guid(makeGUID(pool, 0, 2));
        hv.set_name(pool.string("Internal Only Canvas"));
        hv.set_internalOnly(true);
        hv.set_parentIndex(makeParent(pool, 0, 0, "~"));
    }

    // compset 全量节点
    {
        std::set<std::string> writtenGuids;
        for (auto &cs : compSets) {
            auto *nodes = cs->msg.pixsoNodes();
            if (!nodes) continue;
            uint32_t M = nodes->size();

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
                if (!writtenGuids.insert(gkStr(gs, gl)).second) continue;

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

    // blobs
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

    // 10. 编码 → 压缩 → hex → 写文件
    kiwi::ByteBuffer bb;
    if (!out.encode(bb)) return errJson("kiwi encode failed");

    std::vector<uint8_t> kiwiBin(bb.data(), bb.data() + bb.size());
    auto pixData = compressToPix(kiwiBin);
    if (pixData.empty()) return errJson("zstd compress failed");

    // 返回 hex 字符串，由 JS 层写文件（避免 WASM fopen 中文路径问题）
    return "<!-- pixso binary data -->\n" + bytesToHex(pixData);
}

EMSCRIPTEN_BINDINGS(compset_instantiate_wasm) {
    // 3 参数：indexPath, baseDir, setNames（逗号分隔，空=全部）
    // 返回 hex 字符串（成功）或 JSON error（失败）
    emscripten::function("instantiateCompSet", &instantiateCompSet);
}
