// compset_instantiate_wasm.cpp
// WASM 导出入口：从 component_index.json + hex 组件集为每个变体生成独立 hex 文件
//
// NODERAWFS=1：fopen/fread 直接路由 Node.js fs

#define IMPLEMENT_KIWI_H
#define IMPLEMENT_SCHEMA_H

#include "kiwi.h"
#include "pixso.h"
#include "zstd.h"

#include <emscripten/bind.h>

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
        else if (c == '\r') out += "\\r";
        else                out += c;
    }
    return out + "\"";
}

static std::string errJson(const std::string &msg) {
    return "{\"error\":" + jsonStr(msg) + "}";
}

// =============================================================================
// 为单个变体构建 hex 字符串
//
// 输出节点结构：
//   CANVAS {0,1}               ← 可见画布
//     INSTANCE {dslS,1}        ← 该变体的实例
//   CANVAS {0,2} internalOnly  ← 组件库挂载点
//     <compset 全量节点（去 CANVAS，孤根改挂 {0,2}）>
// =============================================================================

static std::string buildOneVariantHex(
        const VariantInfo    &vi,
        const PixsoNode      *symNode,
        const CompSetData    &cs,
        const ChildrenMap    &cm,
        uint32_t              dslSession)   // max(compset session) + 1
{
    // 统计 compset 节点（跳过 CANVAS，GUID 去重）
    auto *csNodes = cs.msg.pixsoNodes();
    uint32_t compCount = 0;
    std::set<std::string> seenGuids;
    if (csNodes) {
        for (uint32_t i = 0; i < csNodes->size(); i++) {
            const PixsoNode &n = (*csNodes)[i];
            if (n.type() && *n.type() == NodeType::CANVAS) continue;
            uint32_t s = (n.guid() && n.guid()->sessionID()) ? *n.guid()->sessionID() : 0;
            uint32_t l = (n.guid() && n.guid()->localID())   ? *n.guid()->localID()   : 0;
            if (seenGuids.insert(gkStr(s, l)).second) compCount++;
        }
    }

    uint32_t total = 1 + 1 + 1 + compCount; // 可见CANVAS + INSTANCE + 隐藏CANVAS + compset

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
        cv.set_name(pool.string(vi.name.c_str()));
        cv.set_parentIndex(makeParent(pool, 0, 0, "!"));
    }

    // INSTANCE {dslSession, 1}
    {
        PixsoNode &n = arr[idx++];
        n.set_type(NodeType::INSTANCE);
        n.set_phase(NodePhase::CREATED);
        n.set_guid(makeGUID(pool, dslSession, 1));
        n.set_name(pool.string(vi.name.c_str()));
        n.set_visible(true);
        n.set_parentIndex(makeParent(pool, 0, 1, makePos(0)));

        Matrix *mat = pool.allocate<Matrix>(); new(mat) Matrix();
        mat->set_m00(1.f); mat->set_m01(0.f); mat->set_m02(0.f);
        mat->set_m10(0.f); mat->set_m11(1.f); mat->set_m12(0.f);
        n.set_transform(mat);

        float w = 0.f, h = 0.f;
        if (symNode->size()) {
            if (symNode->size()->x() && *symNode->size()->x() > 0) w = *symNode->size()->x();
            if (symNode->size()->y() && *symNode->size()->y() > 0) h = *symNode->size()->y();
        }
        Vector *sz = pool.allocate<Vector>(); new(sz) Vector();
        sz->set_x(w); sz->set_y(h);
        n.set_size(sz);

        SymbolData *sd = pool.allocate<SymbolData>(); new(sd) SymbolData();
        sd->set_symbolID(makeGUID(pool, vi.guidS, vi.guidL));
        n.set_symbolData(sd);

        // derivedSymbolData
        uint32_t cnt = computeDerivedCount(*symNode, cm);
        if (cnt > 0) {
            auto &dsd = n.set_derivedSymbolData(pool, cnt);
            uint32_t dsdIdx = 0;
            std::vector<std::pair<uint32_t,uint32_t>> path;
            fillDerivedSlots(pool, dsd, dsdIdx, *symNode, cm, path);
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

    // compset 全量节点（孤根改挂 {0,2}，每个文件独立，无需 blob 重映射）
    if (csNodes) {
        // 本组件集非 CANVAS 节点的 GUID 集合（用于孤根判断）
        std::set<std::pair<uint32_t,uint32_t>> guidSet;
        for (uint32_t i = 0; i < csNodes->size(); i++) {
            const PixsoNode &n = (*csNodes)[i];
            if (n.type() && *n.type() == NodeType::CANVAS) continue;
            if (n.guid() && n.guid()->sessionID() && n.guid()->localID())
                guidSet.insert({*n.guid()->sessionID(), *n.guid()->localID()});
        }

        std::set<std::string> written;
        for (uint32_t i = 0; i < csNodes->size(); i++) {
            const PixsoNode &orig = (*csNodes)[i];
            if (orig.type() && *orig.type() == NodeType::CANVAS) continue;

            uint32_t gs = (orig.guid() && orig.guid()->sessionID()) ? *orig.guid()->sessionID() : 0;
            uint32_t gl = (orig.guid() && orig.guid()->localID())   ? *orig.guid()->localID()   : 0;
            if (!written.insert(gkStr(gs, gl)).second) continue;

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
            idx++;
        }
    }

    // blobs：直接从该 compset 原始数据复制，无需重映射
    auto *csBlobs = cs.msg.blobs();
    if (csBlobs && csBlobs->size() > 0) {
        auto &outBlobs = out.set_blobs(pool, csBlobs->size());
        for (uint32_t i = 0; i < csBlobs->size(); i++) {
            const auto *bytes = (*csBlobs)[i].bytes();
            if (bytes && bytes->size() > 0) {
                auto &dst = outBlobs[i].set_bytes(pool, bytes->size());
                for (uint32_t j = 0; j < bytes->size(); j++) dst[j] = (*bytes)[j];
            }
        }
    }

    kiwi::ByteBuffer bb;
    if (!out.encode(bb)) return "";

    std::vector<uint8_t> kiwiBin(bb.data(), bb.data() + bb.size());
    auto pixData = compressToPix(kiwiBin);
    if (pixData.empty()) return "";

    return "<!-- pixso binary data -->\n" + bytesToHex(pixData);
}

// =============================================================================
// WASM 导出函数
//
// instantiateCompSet(indexPath, baseDir, setNames) → JSON 数组 | error JSON
//
//   indexPath : component_index.json 的绝对路径
//   baseDir   : hexFile 字段的基准目录
//   setNames  : 逗号分隔的组件集名称（空字符串 = 全部）
//
// 成功返回 JSON 数组，每个元素对应一个变体：
//   [
//     { "setName":"文字链接", "variantName":"status=...", "guid":"8229:277395", "hex":"<!-- ...\n<hexdata>" },
//     ...
//   ]
//
// 失败返回：{"error":"..."}
// =============================================================================

std::string instantiateCompSet(const std::string &indexPath,
                               const std::string &baseDir,
                               const std::string &setNames) {
    if (indexPath.empty()) return errJson("indexPath is empty");

    // 解析名称过滤列表（逗号分隔）
    std::set<std::string> nameFilter;
    {
        std::string cur;
        for (char c : setNames) {
            if (c == ',') { if (!cur.empty()) { nameFilter.insert(cur); cur.clear(); } }
            else            cur += c;
        }
        if (!cur.empty()) nameFilter.insert(cur);
    }

    // 解析索引
    auto allEntries = parseIndex(indexPath.c_str());
    if (allEntries.empty()) return errJson("failed to parse index: " + indexPath);

    // 过滤
    std::vector<CompSetEntry *> selected;
    for (auto &e : allEntries)
        if (nameFilter.empty() || nameFilter.count(e.name))
            selected.push_back(&e);
    if (selected.empty()) return errJson("no matching component sets");

    // 加载 hex 文件
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

    // 建 SymbolMap 和 ChildrenMap
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

    // 计算各组件集的 dslSession（比自身最大 session 大 1）
    std::map<CompSetData *, uint32_t> dslSessions;
    for (auto &cs : compSets) {
        uint32_t maxSess = 1;
        auto *nodes = cs->msg.pixsoNodes();
        if (nodes) {
            for (uint32_t i = 0; i < nodes->size(); i++) {
                const PixsoNode &n = (*nodes)[i];
                if (n.guid() && n.guid()->sessionID())
                    maxSess = std::max(maxSess, *n.guid()->sessionID());
            }
        }
        dslSessions[cs.get()] = maxSess + 1;
    }

    // 逐变体生成 hex，拼接为 JSON 数组
    std::string jsonOut = "[";
    bool first = true;

    for (auto *entry : selected) {
        auto csIt = entryToCS.find(entry);
        if (csIt == entryToCS.end()) continue;
        CompSetData *cs    = csIt->second;
        auto cmIt          = childMaps.find(cs);
        if (cmIt == childMaps.end()) continue;
        const ChildrenMap &cm = cmIt->second;
        uint32_t dslSess   = dslSessions[cs];

        for (auto &vi : entry->variants) {
            auto smIt = symMap.find(gkStr(vi.guidS, vi.guidL));
            if (smIt == symMap.end()) {
                fprintf(stderr, "[WARN] 变体 \"%s\" guid={%u,%u} 未找到，跳过\n",
                        vi.name.c_str(), vi.guidS, vi.guidL);
                continue;
            }
            const PixsoNode *symNode = smIt->second.second;

            std::string hex = buildOneVariantHex(vi, symNode, *cs, cm, dslSess);
            if (hex.empty()) {
                fprintf(stderr, "[WARN] 变体 \"%s\" 构建失败，跳过\n", vi.name.c_str());
                continue;
            }

            if (!first) jsonOut += ",";
            first = false;
            jsonOut += "{\"setName\":"     + jsonStr(entry->name)
                     + ",\"variantName\":" + jsonStr(vi.name)
                     + ",\"guid\":\""      + std::to_string(vi.guidS) + ":" + std::to_string(vi.guidL) + "\""
                     + ",\"hex\":"         + jsonStr(hex)
                     + "}";
        }
    }

    jsonOut += "]";
    return jsonOut;
}

EMSCRIPTEN_BINDINGS(compset_instantiate_wasm) {
    emscripten::function("instantiateCompSet", &instantiateCompSet);
}
