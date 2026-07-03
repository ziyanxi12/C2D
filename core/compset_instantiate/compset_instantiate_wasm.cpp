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
    std::string variantKey;   // 唯一 hash；为空时 fallback 到 guid
    uint32_t    guidS = 0, guidL = 0;
};

struct CompSetEntry {
    std::string              name;
    std::string              hexFile;
    std::vector<VariantInfo> variants;
};

// standaloneComponents：单个独立组件（非变体集）
struct StandaloneEntry {
    std::string name;
    std::string componentKey;  // 唯一 hash；为空时 fallback 到 guid
    std::string hexFile;
    uint32_t    guidS = 0, guidL = 0;
};

// =============================================================================
// 解析 component_index.json
// =============================================================================

struct IndexData {
    std::vector<CompSetEntry>   componentSets;
    std::vector<StandaloneEntry> standaloneComponents;
};

static IndexData parseIndex(const char *path) {
    IndexData result;
    auto raw = readFile(path);
    if (raw.empty()) return result;

    JsonParser jp((const char *)raw.data(), raw.size());
    JVal root = jp.parse();
    if (root.isNull()) return result;

    // componentSets
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
            vi.name       = v.get("name").asStr();
            vi.variantKey = v.get("variantKey").asStr();
            auto gk = parseGK(v.get("guid").asStr());
            vi.guidS = gk.s;
            vi.guidL = gk.l;
            entry.variants.push_back(vi);
        }
        result.componentSets.push_back(std::move(entry));
    }

    // standaloneComponents
    const JVal &sas = root.get("standaloneComponents");
    for (size_t i = 0; i < sas.size(); i++) {
        const JVal &s = sas[i];
        StandaloneEntry e;
        e.name         = s.get("name").asStr();
        e.componentKey = s.get("componentKey").asStr();
        e.hexFile      = s.get("hexFile").asStr();
        auto gk = parseGK(s.get("guid").asStr());
        e.guidS = gk.s;
        e.guidL = gk.l;
        result.standaloneComponents.push_back(std::move(e));
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

// key 优先用 hash，为空时 fallback 到 guidS_guidL
static std::string resolveKey(const std::string &hash, uint32_t s, uint32_t l) {
    if (!hash.empty()) return hash;
    return std::to_string(s) + "_" + std::to_string(l);
}

// =============================================================================
// 为单个 SYMBOL 构建独立 hex 字符串
//
// 输出节点结构：
//   CANVAS {0,1}  "<variantName>"
//     INSTANCE {dslSession,1}
//   CANVAS {0,2}  internalOnly
//     <compset 全量节点>
// =============================================================================

static std::string buildOneInstanceHex(
        const std::string &variantName,
        uint32_t           symGuidS,
        uint32_t           symGuidL,
        const PixsoNode   *symNode,
        const CompSetData &cs,
        const ChildrenMap &cm,
        uint32_t           dslSession)
{
    auto *csNodes = cs.msg.pixsoNodes();
    uint32_t compCount = 0;
    {
        std::set<std::string> seen;
        if (csNodes) {
            for (uint32_t i = 0; i < csNodes->size(); i++) {
                const PixsoNode &n = (*csNodes)[i];
                if (n.type() && *n.type() == NodeType::CANVAS) continue;
                uint32_t s = (n.guid() && n.guid()->sessionID()) ? *n.guid()->sessionID() : 0;
                uint32_t l = (n.guid() && n.guid()->localID())   ? *n.guid()->localID()   : 0;
                if (seen.insert(gkStr(s, l)).second) compCount++;
            }
        }
    }

    uint32_t total = 1 + 1 + 1 + compCount;

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
        cv.set_name(pool.string(variantName.c_str()));
        cv.set_parentIndex(makeParent(pool, 0, 0, "!"));
    }

    // INSTANCE {dslSession, 1}
    {
        PixsoNode &n = arr[idx++];
        n.set_type(NodeType::INSTANCE);
        n.set_phase(NodePhase::CREATED);
        n.set_guid(makeGUID(pool, dslSession, 1));
        n.set_name(pool.string(variantName.c_str()));
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
        sd->set_symbolID(makeGUID(pool, symGuidS, symGuidL));
        n.set_symbolData(sd);

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

    // compset 全量节点（孤根改挂 {0,2}，不需要 blob 重映射）
    if (csNodes) {
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

    // blobs：直接从该 compset 复制，无需重映射
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
//   setNames  : 逗号分隔的名称过滤（空 = 全部，含 componentSets + standaloneComponents）
//
// 成功返回 JSON 数组，每个元素对应一个变体/独立组件：
//   [
//     { "key":"<variantKey 或 guidS_guidL>", "name":"...", "hex":"..." },
//     ...
//   ]
//
// key 规则：
//   componentSets 变体  → variantKey（非空）或 guidS_guidL（fallback）
//   standaloneComponents → componentKey（非空）或 guidS_guidL（fallback）
//
// 失败返回：{"error":"..."}
// =============================================================================

std::string instantiateCompSet(const std::string &indexPath,
                               const std::string &baseDir,
                               const std::string &setNames) {
    if (indexPath.empty()) return errJson("indexPath is empty");

    std::set<std::string> nameFilter;
    {
        std::string cur;
        for (char c : setNames) {
            if (c == ',') { if (!cur.empty()) { nameFilter.insert(cur); cur.clear(); } }
            else            cur += c;
        }
        if (!cur.empty()) nameFilter.insert(cur);
    }

    auto idx = parseIndex(indexPath.c_str());
    if (idx.componentSets.empty() && idx.standaloneComponents.empty())
        return errJson("failed to parse index: " + indexPath);

    std::string bd = baseDir;
    if (!bd.empty() && bd.back() != '/') bd += '/';

    // 加载 CompSetData，按 hexFile 去重（多个变体共享同一 hex 文件）
    std::map<std::string, std::unique_ptr<CompSetData>> csCache;
    auto getCS = [&](const std::string &hexFile) -> CompSetData * {
        auto it = csCache.find(hexFile);
        if (it != csCache.end()) return it->second.get();
        auto cs = std::make_unique<CompSetData>();
        std::string path = bd + hexFile;
        if (!loadCompSet(path.c_str(), *cs)) {
            fprintf(stderr, "[WARN] 加载失败: %s\n", path.c_str());
            return nullptr;
        }
        auto *ptr = cs.get();
        csCache[hexFile] = std::move(cs);
        return ptr;
    };

    // 每个 CompSetData 对应一个 ChildrenMap 和 SymbolMap
    std::map<CompSetData *, ChildrenMap>                               childMaps;
    std::map<CompSetData *, std::map<std::string, const PixsoNode *>> symMaps;

    auto ensureMaps = [&](CompSetData *cs) {
        if (childMaps.count(cs)) return;
        childMaps[cs] = buildChildrenMap(*cs);
        auto &sm = symMaps[cs];
        auto *nodes = cs->msg.pixsoNodes();
        if (!nodes) return;
        for (uint32_t i = 0; i < nodes->size(); i++) {
            const PixsoNode &n = (*nodes)[i];
            if (!n.type() || *n.type() != NodeType::SYMBOL || !n.guid()) continue;
            uint32_t s = n.guid()->sessionID() ? *n.guid()->sessionID() : 0;
            uint32_t l = n.guid()->localID()   ? *n.guid()->localID()   : 0;
            sm[gkStr(s, l)] = &n;
        }
    };

    auto dslSessionOf = [](CompSetData *cs) -> uint32_t {
        uint32_t maxSess = 1;
        auto *nodes = cs->msg.pixsoNodes();
        if (nodes) {
            for (uint32_t i = 0; i < nodes->size(); i++) {
                const PixsoNode &n = (*nodes)[i];
                if (n.guid() && n.guid()->sessionID())
                    maxSess = std::max(maxSess, *n.guid()->sessionID());
            }
        }
        return maxSess + 1;
    };

    std::string jsonOut = "[";
    bool first = true;

    auto emit = [&](const std::string &key, const std::string &name,
                    uint32_t symS, uint32_t symL,
                    const std::string &hexFile) {
        CompSetData *cs = getCS(hexFile);
        if (!cs) return;
        ensureMaps(cs);

        auto smIt = symMaps[cs].find(gkStr(symS, symL));
        if (smIt == symMaps[cs].end()) {
            fprintf(stderr, "[WARN] SYMBOL {%u,%u} 未找到 (%s)\n", symS, symL, name.c_str());
            return;
        }
        const PixsoNode *symNode = smIt->second;

        std::string hex = buildOneInstanceHex(name, symS, symL, symNode,
                                              *cs, childMaps[cs], dslSessionOf(cs));
        if (hex.empty()) {
            fprintf(stderr, "[WARN] 构建失败: %s\n", name.c_str());
            return;
        }

        if (!first) jsonOut += ",";
        first = false;
        jsonOut += "{\"key\":"  + jsonStr(key)
                 + ",\"name\":" + jsonStr(name)
                 + ",\"hex\":"  + jsonStr(hex)
                 + "}";
    };

    // ── componentSets 变体 ────────────────────────────────────────────────────
    for (auto &entry : idx.componentSets) {
        if (!nameFilter.empty() && !nameFilter.count(entry.name)) continue;
        for (auto &vi : entry.variants) {
            std::string key = resolveKey(vi.variantKey, vi.guidS, vi.guidL);
            emit(key, vi.name, vi.guidS, vi.guidL, entry.hexFile);
        }
    }

    // ── standaloneComponents ─────────────────────────────────────────────────
    for (auto &sa : idx.standaloneComponents) {
        if (!nameFilter.empty() && !nameFilter.count(sa.name)) continue;
        std::string key = resolveKey(sa.componentKey, sa.guidS, sa.guidL);
        emit(key, sa.name, sa.guidS, sa.guidL, sa.hexFile);
    }

    jsonOut += "]";

    if (first) return errJson("no variants matched");
    return jsonOut;
}

EMSCRIPTEN_BINDINGS(compset_instantiate_wasm) {
    emscripten::function("instantiateCompSet", &instantiateCompSet);
}
