#pragma once

#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <memory>
#include <set>
#include <queue>

// =============================================================================
// 文件 I/O
// =============================================================================

static std::vector<uint8_t> readFile(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "cannot open: %s\n", path); return {}; }
    fseek(f, 0, SEEK_END); long sz = ftell(f); fseek(f, 0, SEEK_SET);
    std::vector<uint8_t> buf(sz);
    fread(buf.data(), 1, sz, f); fclose(f);
    return buf;
}

// =============================================================================
// .pix 格式工具
// =============================================================================

static const char    PIX_MAGIC[] = "pixso-kw";
static const uint8_t PIX_VER[2]  = {0x00, 0x02};
static const char    PIX_META[]  = "compress:zstd";

static std::vector<uint8_t> compressToPix(const std::vector<uint8_t> &kiwiBin) {
    size_t bound = ZSTD_compressBound(kiwiBin.size());
    std::vector<uint8_t> comp(bound);
    size_t r = ZSTD_compress(comp.data(), bound, kiwiBin.data(), kiwiBin.size(), 3);
    if (ZSTD_isError(r)) { fprintf(stderr, "zstd compress error\n"); return {}; }
    comp.resize(r);

    std::vector<uint8_t> out;
    out.insert(out.end(), PIX_MAGIC, PIX_MAGIC + 8);
    out.push_back(PIX_VER[0]); out.push_back(PIX_VER[1]);
    uint8_t ml = (uint8_t)strlen(PIX_META);
    out.push_back(ml);
    out.insert(out.end(), PIX_META, PIX_META + ml);
    out.insert(out.end(), comp.begin(), comp.end());
    return out;
}

static size_t parsePixHeader(const std::vector<uint8_t> &d) {
    if (d.size() < 12) return 0;
    if (memcmp(d.data(), PIX_MAGIC, 8) != 0) return 0;
    size_t pos = 8 + 2;
    uint8_t metaLen = d[pos++];
    pos += metaLen;
    return (pos < d.size()) ? pos : 0;
}

static std::vector<uint8_t> decompressZstd(const uint8_t *src, size_t sz) {
    unsigned long long cs = ZSTD_getFrameContentSize(src, sz);
    if (cs == ZSTD_CONTENTSIZE_ERROR) { fprintf(stderr, "bad zstd frame\n"); return {}; }
    size_t dstSz = (cs == ZSTD_CONTENTSIZE_UNKNOWN) ? sz * 8 : (size_t)cs;
    std::vector<uint8_t> dst(dstSz);
    size_t r = ZSTD_decompress(dst.data(), dstSz, src, sz);
    if (ZSTD_isError(r)) { fprintf(stderr, "zstd error: %s\n", ZSTD_getErrorName(r)); return {}; }
    dst.resize(r); return dst;
}

static std::string bytesToHex(const std::vector<uint8_t> &d) {
    static const char H[] = "0123456789abcdef";
    std::string r; r.reserve(d.size() * 2);
    for (uint8_t b : d) { r += H[b >> 4]; r += H[b & 0xF]; }
    return r;
}

// =============================================================================
// 组件集加载工具
// =============================================================================

static std::vector<uint8_t> hexToBytes(const std::string &hex) {
    std::vector<uint8_t> out;
    out.reserve(hex.size() / 2);
    for (size_t i = 0; i + 1 < hex.size(); i += 2) {
        auto hv = [](char c) -> uint8_t {
            if (c >= '0' && c <= '9') return (uint8_t)(c - '0');
            if (c >= 'a' && c <= 'f') return (uint8_t)(c - 'a' + 10);
            if (c >= 'A' && c <= 'F') return (uint8_t)(c - 'A' + 10);
            return 0;
        };
        out.push_back((hv(hex[i]) << 4) | hv(hex[i + 1]));
    }
    return out;
}

struct CompSetData {
    kiwi::MemoryPool pool;
    PixsoMsg         msg;
};

// =============================================================================
// 表格模版（struct 在此声明，loadTableTemplate 定义在 gkStr 之后）
// =============================================================================

struct TableTemplate {
    kiwi::MemoryPool pool;
    PixsoMsg         msg;

    // 模版中的关键节点指针（指向 pool 内存，生命周期与 TableTemplate 一致）
    const PixsoNode *tmplRoot   = nullptr;  // "表格"（根 FRAME）
    const PixsoNode *tmplTable  = nullptr;  // "$Table"
    const PixsoNode *tmplColumn = nullptr;  // ".$Table-Column"
    const PixsoNode *tmplHeader = nullptr;  // ".$Table-Col-Header"
    const PixsoNode *tmplBody   = nullptr;  // ".$Table-Col-Body"
    const PixsoNode *tmplCell   = nullptr;  // ".$Table-Cell"
    const PixsoNode *tmplRect   = nullptr;  // 分隔矩形（第二子节点）

    // tmplHeader 的直接子节点（按模版 kiwi 数组顺序）：
    //   TEXT  → 替换为 DSL 列头文字
    //   其余（RECT "bg" 等）→ 原样克隆
    std::vector<const PixsoNode *> tmplHdrChildren;

    // tmplCell 的直接子节点（按模版 kiwi 数组顺序）：
    //   TEXT  → 替换为 DSL cell 文字
    //   其余（RECT "竖线" 等）→ 原样克隆
    std::vector<const PixsoNode *> tmplCellChildren;

    // 模版中除结构节点外的所有节点（组件库：SYMBOL/FRAME/RECT/VECTOR 等），
    // 需要原样输出到隐藏页 {0,2}，使 Paging 等 INSTANCE 引用的 SYMBOL 能正确渲染。
    std::vector<const PixsoNode *> libraryNodes;

    // 从模版提取的默认尺寸
    float colWidth     = 409.f;
    float rowHeight    = 43.f;
    float headerHeight = 36.f;

    bool valid() const {
        return tmplRoot && tmplTable && tmplColumn &&
               tmplHeader && tmplBody && tmplCell && tmplRect;
    }
};

static bool loadCompSet(const char *path, CompSetData &cs) {
    auto raw = readFile(path);
    if (raw.empty()) return false;

    std::vector<uint8_t> pixBytes;
    std::string p(path);
    if (p.size() >= 4 && p.substr(p.size() - 4) == ".txt") {
        std::string hex;
        hex.reserve(raw.size());
        bool inComment = false;
        for (uint8_t c : raw) {
            if (c == '#' || c == '<') { inComment = true; continue; }
            if (c == '\n')            { inComment = false; continue; }
            if (inComment) continue;
            if ((c >= '0' && c <= '9') ||
                (c >= 'a' && c <= 'f') ||
                (c >= 'A' && c <= 'F'))
                hex += (char)c;
        }
        pixBytes = hexToBytes(hex);
    } else {
        pixBytes = std::move(raw);
    }

    size_t off = parsePixHeader(pixBytes);
    if (!off) { fprintf(stderr, "  [ERROR] %s: bad pix header\n", path); return false; }

    auto dec = decompressZstd(pixBytes.data() + off, pixBytes.size() - off);
    if (dec.empty()) { fprintf(stderr, "  [ERROR] %s: decompress failed\n", path); return false; }

    kiwi::ByteBuffer bb(dec.data(), dec.size());
    if (!cs.msg.decode(bb, cs.pool)) {
        fprintf(stderr, "  [ERROR] %s: kiwi decode failed\n", path);
        return false;
    }
    return true;
}

// =============================================================================
// 简单 JSON 解析器（递归下降）
// =============================================================================

struct JVal {
    enum Type { Null, Bool, Int, Dbl, Str, Arr, Obj } type = Null;
    bool        b   = false;
    int64_t     i   = 0;
    double      d   = 0.0;
    std::string s;
    std::vector<JVal>                         arr;
    std::vector<std::pair<std::string, JVal>> obj;

    bool isNull() const { return type == Null; }
    bool asBool() const { return type==Bool ? b : (type==Int ? i!=0 : false); }
    double asDouble() const { return type==Dbl ? d : (type==Int ? (double)i : 0.0); }
    float  asFloat()  const { return (float)asDouble(); }
    const std::string& asStr() const { static std::string e; return type==Str ? s : e; }

    bool has(const std::string &k) const {
        if (type != Obj) return false;
        for (auto &kv : obj) if (kv.first == k) return true;
        return false;
    }
    const JVal& get(const std::string &k) const {
        static JVal e;
        if (type != Obj) return e;
        for (auto &kv : obj) if (kv.first == k) return kv.second;
        return e;
    }
    size_t size() const { return type==Arr ? arr.size() : 0; }
    const JVal& operator[](size_t idx) const {
        static JVal e;
        return (type==Arr && idx < arr.size()) ? arr[idx] : e;
    }
};

struct JsonParser {
    const char *p, *e;
    JsonParser(const char *data, size_t len) : p(data), e(data + len) {}

    void ws() { while (p < e && ((uint8_t)*p <= 32)) p++; }

    JVal parse() {
        ws();
        if (p >= e) return {};
        switch (*p) {
            case '{': return parseObj();
            case '[': return parseArr();
            case '"': return parseStr();
            case 't': { p += 4; JVal v; v.type=JVal::Bool; v.b=true;  return v; }
            case 'f': { p += 5; JVal v; v.type=JVal::Bool; v.b=false; return v; }
            case 'n': { p += 4; return {}; }
            default:  return parseNum();
        }
    }

    JVal parseObj() {
        JVal v; v.type = JVal::Obj;
        p++; ws();
        while (p < e && *p != '}') {
            JVal key = parseStr(); ws();
            if (p < e && *p == ':') p++; ws();
            JVal val = parse();
            v.obj.emplace_back(key.s, std::move(val));
            ws();
            if (p < e && *p == ',') { p++; ws(); }
        }
        if (p < e) p++;
        return v;
    }

    JVal parseArr() {
        JVal v; v.type = JVal::Arr;
        p++; ws();
        while (p < e && *p != ']') {
            v.arr.push_back(parse()); ws();
            if (p < e && *p == ',') { p++; ws(); }
        }
        if (p < e) p++;
        return v;
    }

    JVal parseStr() {
        JVal v; v.type = JVal::Str;
        p++;
        while (p < e && *p != '"') {
            if (*p == '\\' && p + 1 < e) {
                p++;
                switch (*p) {
                    case '"':  v.s += '"';  break;
                    case '\\': v.s += '\\'; break;
                    case '/':  v.s += '/';  break;
                    case 'n':  v.s += '\n'; break;
                    case 't':  v.s += '\t'; break;
                    case 'r':  v.s += '\r'; break;
                    default:   v.s += *p;   break;
                }
            } else {
                v.s += *p;
            }
            p++;
        }
        if (p < e) p++;
        return v;
    }

    JVal parseNum() {
        const char *start = p;
        bool isFloat = false;
        if (p < e && (*p == '-' || *p == '+')) p++;
        while (p < e && *p >= '0' && *p <= '9') p++;
        if (p < e && *p == '.') {
            isFloat = true; p++;
            while (p < e && *p >= '0' && *p <= '9') p++;
        }
        if (p < e && (*p == 'e' || *p == 'E')) {
            isFloat = true; p++;
            if (p < e && (*p == '+' || *p == '-')) p++;
            while (p < e && *p >= '0' && *p <= '9') p++;
        }
        std::string ns(start, p - start);
        JVal v;
        if (isFloat) { v.type = JVal::Dbl; v.d = std::stod(ns); }
        else         { v.type = JVal::Int; v.i = std::stoll(ns); }
        return v;
    }
};

// =============================================================================
// DSL 数据结构
// =============================================================================

struct DslBox { float x=0, y=0, w=0, h=0; };

struct DslFill {
    std::string type    = "solid";
    std::string color   = "#000000FF";
    float       opacity = 1.0f;
    bool        visible = true;
};

struct DslStroke {
    std::string type    = "solid";
    std::string color   = "#000000FF";
    float       opacity = 1.0f;
    bool        visible = true;
};

struct DslOverride {
    std::string nodeId;  // "320:12075"
    std::string field;   // "text_content"
    std::string value;   // "查看更多"
};

struct DslAutoLayout {
    bool        enabled       = false;
    std::string direction     = "vertical"; // "horizontal" | "vertical"
    float       gap           = 0.0f;
    float       counterGap    = 0.0f;      // 交叉轴间距（wrap模式下）
    float       padTop        = 0.0f;
    float       padRight      = 0.0f;
    float       padBottom     = 0.0f;
    float       padLeft       = 0.0f;
    std::string alignItems    = "min";   // min / center / max / stretch
    std::string justifyContent= "min";  // min / center / max / space_evenly
    bool        wrap          = false;
};

// ─── 表格数据（前向声明 DslLayer，供 DslTableData 使用）────────────────────
struct DslLayer;

struct DslTableData {
    std::vector<std::string>            headers;
    std::vector<std::vector<DslLayer>>  rows;     // 每格是完整 DslLayer
    float colWidth     = 0.f;  // 0 = 用模版默认值
    float rowHeight    = 0.f;
    float headerHeight = 0.f;
};

// ─────────────────────────────────────────────────────────────────────────────
struct DslLayer {
    std::string id, name, type;
    bool        visible      = true;
    float       opacity      = 1.0f;
    std::string blendMode    = "normal";
    DslBox      box;
    float       cornerRadius = 0.0f;
    // 独立圆角字段（顺时针：TL, TR, BR, BL）
    float       cornerRadiusTL = 0.0f;  // topLeft
    float       cornerRadiusTR = 0.0f;  // topRight
    float       cornerRadiusBR = 0.0f;  // bottomRight
    float       cornerRadiusBL = 0.0f;  // bottomLeft
    bool        cornerRadiiIndependent = false;
    std::vector<DslFill>  fills;
    std::vector<DslStroke> strokes;  // 描边列表
    float       strokeWidth = 1.0f;  // 描边宽度（默认1px）
    std::vector<DslLayer> children;
    DslAutoLayout autoLayout;
    // instance 字段
    std::string symbolId, variantKey, componentSetKey;
    bool        componentSetResolved = true;  // 组件集是否可解析（默认true）
    std::vector<DslOverride> overrides;
    // text 字段
    std::string textContent;
    std::string textFontFamily = "PingFang SC";
    std::string textFontStyle  = "Regular";
    float       textFontSize   = 14.0f;
    std::string textColor      = "#0F172AFF";
    std::string textAlignH        = "left";   // left / center / right / justified
    std::string textAlignV        = "top";    // top / center / bottom
    float       textLetterSpacing = 0.0f;    // px，0 表示默认
    std::string textLineHeight    = "auto";  // "auto" 或 px 数字字符串
    // PlaceholderMeta（公共字段，所有图层均可有）
    bool        placeholderEnabled = false;
    std::string placeholderType;   // instance / vector / image
    std::string placeholderNote;
    // 表格数据（type=="table" 时有效）
    DslTableData tableData;
};

struct DslPage { std::string id, name; std::vector<DslLayer> layers; };
struct DslDoc  { std::vector<DslPage> pages; };

// =============================================================================
// DSL JSON 解析
// =============================================================================

static DslFill parseFill(const JVal &j) {
    DslFill f;
    if (j.has("type"))    f.type    = j.get("type").asStr();
    if (j.has("color"))   f.color   = j.get("color").asStr();
    if (j.has("opacity")) f.opacity = j.get("opacity").asFloat();
    if (j.has("visible")) f.visible = j.get("visible").asBool();
    return f;
}

static DslStroke parseStroke(const JVal &j) {
    DslStroke s;
    if (j.has("type"))    s.type    = j.get("type").asStr();
    if (j.has("color"))   s.color   = j.get("color").asStr();
    if (j.has("opacity")) s.opacity = j.get("opacity").asFloat();
    if (j.has("visible")) s.visible = j.get("visible").asBool();
    return s;
}

static DslLayer parseLayer(const JVal &j) {
    DslLayer l;
    if (j.has("id"))            l.id           = j.get("id").asStr();
    if (j.has("name"))          l.name         = j.get("name").asStr();
    if (j.has("type"))          l.type         = j.get("type").asStr();
    if (j.has("visible"))       l.visible      = j.get("visible").asBool();
    if (j.has("opacity"))       l.opacity      = j.get("opacity").asFloat();
    if (j.has("blend_mode"))    l.blendMode    = j.get("blend_mode").asStr();
    if (j.has("corner_radius")) l.cornerRadius = j.get("corner_radius").asFloat();
    // 独立圆角解析（优先级高于统一圆角）
    if (j.has("corner_radii")) {
        const JVal &cr = j.get("corner_radii");
        if (cr.size() == 4) {
            l.cornerRadiusTL = cr[0].asFloat();  // [TL, TR, BR, BL] 顺时针
            l.cornerRadiusTR = cr[1].asFloat();
            l.cornerRadiusBR = cr[2].asFloat();
            l.cornerRadiusBL = cr[3].asFloat();
            l.cornerRadiiIndependent = true;
        }
    }
    if (j.has("auto_layout")) {
        const JVal &al = j.get("auto_layout");
        l.autoLayout.enabled = true;
        if (al.has("direction"))        l.autoLayout.direction      = al.get("direction").asStr();
        if (al.has("gap"))              l.autoLayout.gap            = al.get("gap").asFloat();
        if (al.has("counter_gap"))      l.autoLayout.counterGap     = al.get("counter_gap").asFloat();
        if (al.has("align_items"))      l.autoLayout.alignItems     = al.get("align_items").asStr();
        if (al.has("justify_content"))  l.autoLayout.justifyContent = al.get("justify_content").asStr();
        if (al.has("wrap"))             l.autoLayout.wrap           = al.get("wrap").asBool();
        if (al.has("padding") && al.get("padding").size() == 4) {
            l.autoLayout.padTop    = al.get("padding")[0].asFloat();
            l.autoLayout.padRight  = al.get("padding")[1].asFloat();
            l.autoLayout.padBottom = al.get("padding")[2].asFloat();
            l.autoLayout.padLeft   = al.get("padding")[3].asFloat();
        }
    }
    // PlaceholderMeta（公共字段）
    if (j.has("placeholder")) {
        const JVal &ph = j.get("placeholder");
        l.placeholderEnabled = ph.get("is_placeholder").asBool();
        if (ph.has("replacement_type")) l.placeholderType = ph.get("replacement_type").asStr();
        if (ph.has("note"))             l.placeholderNote = ph.get("note").asStr();
    }

    if (j.has("box")) {
        const JVal &b = j.get("box");
        l.box = { b.get("x").asFloat(), b.get("y").asFloat(),
                  b.get("width").asFloat(), b.get("height").asFloat() };
    }
    if (j.has("fills")) {
        const JVal &fills = j.get("fills");
        for (size_t i = 0; i < fills.size(); i++)
            l.fills.push_back(parseFill(fills[i]));
    }
    if (j.has("strokes")) {
        const JVal &strokes = j.get("strokes");
        for (size_t i = 0; i < strokes.size(); i++)
            l.strokes.push_back(parseStroke(strokes[i]));
    }
    if (j.has("stroke_width")) l.strokeWidth = j.get("stroke_width").asFloat();
    if (j.has("children")) {
        const JVal &children = j.get("children");
        for (size_t i = 0; i < children.size(); i++)
            l.children.push_back(parseLayer(children[i]));
    }
    if (j.has("instance")) {
        const JVal &inst = j.get("instance");
        if (inst.has("symbol_id"))        l.symbolId        = inst.get("symbol_id").asStr();
        if (inst.has("variant_key"))       l.variantKey      = inst.get("variant_key").asStr();
        if (inst.has("component_set_key")) l.componentSetKey = inst.get("component_set_key").asStr();
        if (inst.has("component_set_resolved")) l.componentSetResolved = inst.get("component_set_resolved").asBool();
        if (inst.has("overrides")) {
            const JVal &ovArr = inst.get("overrides");
            for (size_t i = 0; i < ovArr.size(); i++) {
                const JVal &ov = ovArr[i];
                DslOverride dov;
                if (ov.has("node_id")) dov.nodeId = ov.get("node_id").asStr();
                if (ov.has("field"))   dov.field  = ov.get("field").asStr();
                if (ov.has("value"))   dov.value  = ov.get("value").asStr();
                if (!dov.nodeId.empty() && !dov.field.empty())
                    l.overrides.push_back(std::move(dov));
            }
        }
    }
    if (l.type == "table" && j.has("table")) {
        const JVal &t = j.get("table");
        if (t.has("col_width"))     l.tableData.colWidth     = t.get("col_width").asFloat();
        if (t.has("row_height"))    l.tableData.rowHeight    = t.get("row_height").asFloat();
        if (t.has("header_height")) l.tableData.headerHeight = t.get("header_height").asFloat();
        if (t.has("headers")) {
            for (size_t i = 0; i < t.get("headers").size(); i++)
                l.tableData.headers.push_back(t.get("headers")[i].asStr());
        }
        if (t.has("rows")) {
            const JVal &rows = t.get("rows");
            for (size_t ri = 0; ri < rows.size(); ri++) {
                std::vector<DslLayer> row;
                for (size_t ci = 0; ci < rows[ri].size(); ci++)
                    row.push_back(parseLayer(rows[ri][ci]));
                l.tableData.rows.push_back(std::move(row));
            }
        }
    }
    if (j.has("text_content")) l.textContent = j.get("text_content").asStr();
    if (j.has("text_style")) {
        const JVal &ts = j.get("text_style");
        if (ts.has("font_family")) l.textFontFamily = ts.get("font_family").asStr();
        if (ts.has("font_style"))  l.textFontStyle  = ts.get("font_style").asStr();
        if (ts.has("font_size"))   l.textFontSize   = ts.get("font_size").asFloat();
        if (ts.has("color"))       l.textColor      = ts.get("color").asStr();
        if (ts.has("align_h"))        l.textAlignH        = ts.get("align_h").asStr();
        if (ts.has("align_v"))        l.textAlignV        = ts.get("align_v").asStr();
        if (ts.has("letter_spacing")) l.textLetterSpacing = ts.get("letter_spacing").asFloat();
        if (ts.has("line_height")) {
            const JVal &lh = ts.get("line_height");
            l.textLineHeight = (lh.type == JVal::Str) ? lh.asStr()
                             : std::to_string(lh.asFloat());
        }
    }
    return l;
}

static DslDoc parseDoc(const JVal &j) {
    DslDoc doc;
    if (!j.has("pages")) return doc;
    const JVal &pages = j.get("pages");
    for (size_t i = 0; i < pages.size(); i++) {
        const JVal &pj = pages[i];
        DslPage page;
        if (pj.has("id"))   page.id   = pj.get("id").asStr();
        if (pj.has("name")) page.name = pj.get("name").asStr();
        if (pj.has("layers")) {
            const JVal &layers = pj.get("layers");
            for (size_t k = 0; k < layers.size(); k++)
                page.layers.push_back(parseLayer(layers[k]));
        }
        doc.pages.push_back(std::move(page));
    }
    return doc;
}

// =============================================================================
// GUID / ParentIndex 构造辅助
// =============================================================================

struct GK { uint32_t s = 0, l = 0; };

static GK parseGK(const std::string &id) {
    auto pos = id.find(':');
    if (pos == std::string::npos) return {};
    try {
        return { (uint32_t)std::stoul(id.substr(0, pos)),
                 (uint32_t)std::stoul(id.substr(pos + 1)) };
    } catch (...) { return {}; }
}

static GUID* makeGUID(kiwi::MemoryPool &pool, uint32_t s, uint32_t l) {
    GUID *g = pool.allocate<GUID>(); new(g) GUID();
    g->set_sessionID(s); g->set_localID(l);
    return g;
}

static ParentIndex* makeParent(kiwi::MemoryPool &pool,
                                uint32_t ps, uint32_t pl,
                                const std::string &pos) {
    ParentIndex *pi = pool.allocate<ParentIndex>(); new(pi) ParentIndex();
    pi->set_guid(makeGUID(pool, ps, pl));
    pi->set_position(pool.string(pos.c_str()));
    return pi;
}

static std::string makePos(int idx) {
    char buf[16]; snprintf(buf, sizeof(buf), "a%08x", (unsigned)idx);
    return buf;
}

struct GuidCounter {
    uint32_t session = 1;
    uint32_t local   = 0;
    std::pair<uint32_t,uint32_t> next() { return {session, ++local}; }
};

// =============================================================================
// 类型映射
// =============================================================================

static NodeType mapLayerType(const std::string &t) {
    if (t == "frame")     return NodeType::FRAME;
    if (t == "group")     return NodeType::GROUP;
    if (t == "rectangle") return NodeType::RECTANGLE;
    if (t == "ellipse")   return NodeType::ELLIPSE;
    if (t == "vector")    return NodeType::VECTOR;
    if (t == "star")      return NodeType::STAR;
    if (t == "line")      return NodeType::LINE;
    if (t == "boolean")   return NodeType::BOOLEAN_OPERATION;
    if (t == "text")      return NodeType::TEXT;
    if (t == "instance")  return NodeType::INSTANCE;
    return NodeType::RECTANGLE;
}

static BlendMode mapBlendMode(const std::string &s) {
    if (s == "normal")      return BlendMode::NORMAL;
    if (s == "multiply")    return BlendMode::MULTIPLY;
    if (s == "screen")      return BlendMode::SCREEN;
    if (s == "overlay")     return BlendMode::OVERLAY;
    if (s == "darken")      return BlendMode::DARKEN;
    if (s == "lighten")     return BlendMode::LIGHTEN;
    if (s == "color_dodge") return BlendMode::COLOR_DODGE;
    if (s == "color_burn")  return BlendMode::COLOR_BURN;
    if (s == "hard_light")  return BlendMode::HARD_LIGHT;
    if (s == "soft_light")  return BlendMode::SOFT_LIGHT;
    if (s == "difference")  return BlendMode::DIFFERENCE;
    if (s == "exclusion")   return BlendMode::EXCLUSION;
    if (s == "hue")         return BlendMode::HUE;
    if (s == "saturation")  return BlendMode::SATURATION;
    if (s == "color")       return BlendMode::COLOR;
    if (s == "luminosity")  return BlendMode::LUMINOSITY;
    return BlendMode::NORMAL;
}

// =============================================================================
// 颜色解析 "#RRGGBBAA"
// =============================================================================

static Color* parseColor(kiwi::MemoryPool &pool, const std::string &hex) {
    if (hex.empty() || hex[0] != '#') return nullptr;
    auto hv = [](char c) -> uint8_t {
        if (c >= '0' && c <= '9') return (uint8_t)(c - '0');
        if (c >= 'a' && c <= 'f') return (uint8_t)(c - 'a' + 10);
        if (c >= 'A' && c <= 'F') return (uint8_t)(c - 'A' + 10);
        return 0;
    };
    uint8_t r=0, g=0, b=0, a=255;
    if (hex.size() >= 7) {
        r = hv(hex[1])*16 + hv(hex[2]);
        g = hv(hex[3])*16 + hv(hex[4]);
        b = hv(hex[5])*16 + hv(hex[6]);
    }
    if (hex.size() >= 9) a = hv(hex[7])*16 + hv(hex[8]);

    Color *c = pool.allocate<Color>(); new(c) Color();
    c->set_r((float)r);
    c->set_g((float)g);
    c->set_b((float)b);
    c->set_a((float)a);
    return c;
}

// =============================================================================
// 节点数量统计
// =============================================================================

static uint32_t countLayerNodes(const DslLayer &layer, const TableTemplate *tmpl = nullptr) {
    if (layer.type == "instance") return 1;
    if (layer.type == "table") {
        // 无模版时填 1 个占位 FRAME，保持节点计数一致
        if (!tmpl || !tmpl->valid()) return 1;
        int nCols = (int)layer.tableData.headers.size();
        int nRows = (int)layer.tableData.rows.size();
        // root("表格") + $Table + 矩形分隔
        uint32_t n = 3;
        // 每列：$Table-Column + $Table-Col-Header + header子节点 + $Table-Col-Body
        uint32_t hdrChildCnt = (uint32_t)tmpl->tmplHdrChildren.size();
        n += (uint32_t)nCols * (3u + hdrChildCnt);
        // 每格：$Table-Cell + cell 子节点（模版 RECT 原样 + 模版 TEXT 替换内容）
        uint32_t cellChildCnt = (uint32_t)tmpl->tmplCellChildren.size();
        n += (uint32_t)nCols * (uint32_t)nRows * (1u + cellChildCnt);
        return n;
    }
    uint32_t n = 1;
    for (auto &child : layer.children) n += countLayerNodes(child, tmpl);
    return n;
}

static uint32_t countTotal(const DslDoc &doc, uint32_t compNodeCount = 0,
                            const TableTemplate *tmpl = nullptr) {
    uint32_t n = (uint32_t)doc.pages.size();  // 每个 page 一个可见 CANVAS
    n += 1;                                    // 隐藏 CANVAS {0,2}
    for (auto &page : doc.pages)
        for (auto &layer : page.layers)
            n += countLayerNodes(layer, tmpl);
    n += compNodeCount;
    if (tmpl && tmpl->valid())
        n += (uint32_t)tmpl->libraryNodes.size();
    return n;
}

// =============================================================================
// SymbolMap + derivedSymbolData 计数
// =============================================================================

// GUID 字符串 → (CompSetData*, SYMBOL PixsoNode*)
using SymbolMap   = std::map<std::string, std::pair<CompSetData*, const PixsoNode*>>;
// parent GUID 字符串 → 直接子节点列表
using ChildrenMap = std::map<std::string, std::vector<const PixsoNode*>>;

static std::string gkStr(uint32_t s, uint32_t l) {
    return std::to_string(s) + ":" + std::to_string(l);
}

static ChildrenMap buildChildrenMap(const CompSetData &cs) {
    ChildrenMap m;
    auto *nodes = cs.msg.pixsoNodes();
    if (!nodes) return m;
    for (uint32_t i = 0; i < nodes->size(); i++) {
        const PixsoNode &n = (*nodes)[i];
        auto *pi = n.parentIndex();
        if (!pi || !pi->guid()) continue;
        uint32_t ps = pi->guid()->sessionID() ? *pi->guid()->sessionID() : 0;
        uint32_t pl = pi->guid()->localID()   ? *pi->guid()->localID()   : 0;
        m[gkStr(ps, pl)].push_back(&n);
    }
    return m;
}

// 递归计算 derivedSymbolData 槽位数：
//   普通子节点 → 1 + recurse(children)
//   INSTANCE 子节点 → 1 + 该节点已有的 derivedSymbolData.size()（不再展开）
static uint32_t computeDerivedCount(const PixsoNode &node, const ChildrenMap &cm) {
    if (!node.guid()) return 0;
    uint32_t s = node.guid()->sessionID() ? *node.guid()->sessionID() : 0;
    uint32_t l = node.guid()->localID()   ? *node.guid()->localID()   : 0;
    auto it = cm.find(gkStr(s, l));
    if (it == cm.end()) return 0;

    uint32_t count = 0;
    for (const PixsoNode *child : it->second) {
        count++;
        uint32_t t = child->type() ? (uint32_t)*child->type() : 0;
        if (t == 17 /* INSTANCE */) {
            count += child->derivedSymbolData()
                     ? (uint32_t)child->derivedSymbolData()->size() : 0;
        } else {
            count += computeDerivedCount(*child, cm);
        }
    }
    return count;
}

// =============================================================================
// derivedSymbolData 槽位填充：生成带 guidPath 的完整槽位
// =============================================================================

// 从 (sessionID, localID) 对列表构造 GUIDPath
static GUIDPath* makeGuidPath(kiwi::MemoryPool &pool,
                               const std::vector<std::pair<uint32_t,uint32_t>> &path) {
    GUIDPath *gp = pool.allocate<GUIDPath>(); new(gp) GUIDPath();
    if (path.empty()) return gp;
    auto &guids = gp->set_guids(pool, (uint32_t)path.size());
    for (uint32_t i = 0; i < (uint32_t)path.size(); i++) {
        guids[i].set_sessionID(path[i].first);
        guids[i].set_localID(path[i].second);
    }
    return gp;
}

// 递归填充 derivedSymbolData 槽位，每个槽位写入从 SYMBOL 根到该后代的完整 guidPath。
// 对于 INSTANCE 后代：直接展开其已有的 derivedSymbolData（带路径前缀），不再递归。
// 对于普通节点：递归展开子节点。
// DSL 实例无用户覆盖，所有槽位只需 guidPath，不需要任何 override 数据。
static void fillDerivedSlots(
    kiwi::MemoryPool &pool,
    kiwi::Array<PixsoNode> &slots,
    uint32_t &idx,
    const PixsoNode &parent,
    const ChildrenMap &cm,
    std::vector<std::pair<uint32_t,uint32_t>> &path)
{
    if (!parent.guid()) return;
    uint32_t s = parent.guid()->sessionID() ? *parent.guid()->sessionID() : 0;
    uint32_t l = parent.guid()->localID()   ? *parent.guid()->localID()   : 0;

    auto it = cm.find(gkStr(s, l));
    if (it == cm.end()) return;

    for (const PixsoNode *child : it->second) {
        if (!child->guid()) continue;
        uint32_t cs = child->guid()->sessionID() ? *child->guid()->sessionID() : 0;
        uint32_t cl = child->guid()->localID()   ? *child->guid()->localID()   : 0;

        path.push_back({cs, cl});

        // 该后代自身占一个槽位（只设 guidPath，无 override）
        slots[idx++].set_guidPath(makeGuidPath(pool, path));

        uint32_t t = child->type() ? (uint32_t)*child->type() : 0;
        if (t == 17 /* INSTANCE */ && child->derivedSymbolData()) {
            // INSTANCE：展开其已有的 derivedSymbolData，路径 = 当前路径 + 子槽 guidPath
            auto *subDsd = child->derivedSymbolData();
            for (uint32_t i = 0; i < subDsd->size(); i++) {
                const PixsoNode &sub = (*subDsd)[i];
                std::vector<std::pair<uint32_t,uint32_t>> extPath = path;
                if (sub.guidPath() && sub.guidPath()->guids()) {
                    auto *gArr = sub.guidPath()->guids();
                    for (uint32_t j = 0; j < gArr->size(); j++) {
                        uint32_t gs = (*gArr)[j].sessionID() ? *(*gArr)[j].sessionID() : 0;
                        uint32_t gl = (*gArr)[j].localID()   ? *(*gArr)[j].localID()   : 0;
                        extPath.push_back({gs, gl});
                    }
                }
                slots[idx++].set_guidPath(makeGuidPath(pool, extPath));
            }
        } else {
            // 普通节点：递归展开子节点
            fillDerivedSlots(pool, slots, idx, *child, cm, path);
        }

        path.pop_back();
    }
}

// =============================================================================
// 表格：loadTableTemplate + clone 辅助 + fillTableNode
// =============================================================================

// remapBlobsInNode 在文件后段定义（Blob 辅助节），此处前向声明供 cloneStructNode 使用
static void remapBlobsInNode(PixsoNode &n, const std::map<int32_t, int32_t> &remap);

// 加载并解析表格模版 hex，提取关键节点指针和默认尺寸
static bool loadTableTemplate(const char *path, TableTemplate &tmpl) {
    auto raw = readFile(path);
    if (raw.empty()) return false;

    std::vector<uint8_t> pixBytes;
    std::string p(path);
    // 判断是否为 hex 文本格式：.txt / .hex 扩展名，或内容首字节是 ASCII hex 字符
    auto endsWith = [&](const std::string &s, const std::string &suf) {
        return s.size() >= suf.size() && s.substr(s.size() - suf.size()) == suf;
    };
    bool isHexText = endsWith(p, ".txt") || endsWith(p, ".hex");
    // 也检查内容：若前两字节都是 ASCII hex 字符，则视为 hex 文本
    if (!isHexText && raw.size() >= 2) {
        auto isHexChar = [](uint8_t c) {
            return (c>='0'&&c<='9')||(c>='a'&&c<='f')||(c>='A'&&c<='F');
        };
        isHexText = isHexChar(raw[0]) && isHexChar(raw[1]);
    }
    if (isHexText) {
        std::string hex;
        hex.reserve(raw.size());
        bool inComment = false;
        for (uint8_t c : raw) {
            if (c == '#' || c == '<') { inComment = true; continue; }
            if (c == '\n')            { inComment = false; continue; }
            if (inComment) continue;
            if ((c>='0'&&c<='9')||(c>='a'&&c<='f')||(c>='A'&&c<='F'))
                hex += (char)c;
        }
        pixBytes = hexToBytes(hex);
    } else {
        pixBytes = std::move(raw);
    }

    // 支持两种格式：pix 封装（pixso-kw 魔数）或裸 kiwi 二进制
    std::vector<uint8_t> kiwiBin;
    size_t off = parsePixHeader(pixBytes);
    if (off) {
        // pix 格式：解压 zstd
        kiwiBin = decompressZstd(pixBytes.data() + off, pixBytes.size() - off);
        if (kiwiBin.empty()) { fprintf(stderr, "  [WARN] 表格模版 decompress 失败\n"); return false; }
    } else {
        // 裸 kiwi 二进制（如 .hex 文件是 decompressed kiwi 的 hex 编码）
        kiwiBin = std::move(pixBytes);
    }
    kiwi::ByteBuffer bb(kiwiBin.data(), kiwiBin.size());
    if (!tmpl.msg.decode(bb, tmpl.pool)) {
        fprintf(stderr, "  [WARN] 表格模版 kiwi decode 失败\n"); return false;
    }

    auto *nodes = tmpl.msg.pixsoNodes();
    if (!nodes) return false;

    // parent→children 映射，用于查找 TEXT 子节点
    std::map<std::string, std::vector<const PixsoNode*>> pmap;
    for (uint32_t i = 0; i < nodes->size(); i++) {
        const PixsoNode &n = (*nodes)[i];
        if (!n.parentIndex() || !n.parentIndex()->guid()) continue;
        uint32_t ps = n.parentIndex()->guid()->sessionID() ? *n.parentIndex()->guid()->sessionID() : 0;
        uint32_t pl = n.parentIndex()->guid()->localID()   ? *n.parentIndex()->guid()->localID()   : 0;
        pmap[gkStr(ps, pl)].push_back(&n);
    }

    // 按 name 找关键节点
    for (uint32_t i = 0; i < nodes->size(); i++) {
        const PixsoNode &n = (*nodes)[i];
        const char *nm = n.name() ? n.name()->c_str() : "";
        if      (strcmp(nm, "$Table") == 0)             tmpl.tmplTable  = &n;
        else if (strcmp(nm, ".$Table-Column") == 0)     tmpl.tmplColumn = &n;
        else if (strcmp(nm, ".$Table-Col-Header") == 0) tmpl.tmplHeader = &n;
        else if (strcmp(nm, ".$Table-Col-Body") == 0)   tmpl.tmplBody   = &n;
        else if (strcmp(nm, ".$Table-Cell") == 0)       tmpl.tmplCell   = &n;
        else if (n.type() && *n.type() == NodeType::FRAME
                 && n.parentIndex() && n.parentIndex()->guid()) {
            // 根 FRAME：父节点是 CANVAS
            uint32_t ps = n.parentIndex()->guid()->sessionID() ? *n.parentIndex()->guid()->sessionID() : 0;
            uint32_t pl = n.parentIndex()->guid()->localID()   ? *n.parentIndex()->guid()->localID()   : 0;
            for (uint32_t j = 0; j < nodes->size(); j++) {
                const PixsoNode &pn = (*nodes)[j];
                if (!pn.type() || *pn.type() != NodeType::CANVAS || !pn.guid()) continue;
                uint32_t cs2 = pn.guid()->sessionID() ? *pn.guid()->sessionID() : 0;
                uint32_t cl2 = pn.guid()->localID()   ? *pn.guid()->localID()   : 0;
                if (cs2 == ps && cl2 == pl && !pn.internalOnly()) {
                    tmpl.tmplRoot = &n; break;
                }
            }
        }
    }

    // tmplRect：tmplRoot 的直接子节点中，不是 $Table 的那个（类型不限）
    if (tmpl.tmplRoot && tmpl.tmplTable) {
        uint32_t rootS = tmpl.tmplRoot->guid()->sessionID() ? *tmpl.tmplRoot->guid()->sessionID() : 0;
        uint32_t rootL = tmpl.tmplRoot->guid()->localID()   ? *tmpl.tmplRoot->guid()->localID()   : 0;
        uint32_t tableS = tmpl.tmplTable->guid()->sessionID() ? *tmpl.tmplTable->guid()->sessionID() : 0;
        uint32_t tableL = tmpl.tmplTable->guid()->localID()   ? *tmpl.tmplTable->guid()->localID()   : 0;
        auto it = pmap.find(gkStr(rootS, rootL));
        if (it != pmap.end()) {
            for (const PixsoNode *child : it->second) {
                if (!child->guid()) continue;
                uint32_t cs = child->guid()->sessionID() ? *child->guid()->sessionID() : 0;
                uint32_t cl = child->guid()->localID()   ? *child->guid()->localID()   : 0;
                if (cs == tableS && cl == tableL) continue;  // 跳过 $Table
                tmpl.tmplRect = child;
                break;
            }
        }
    }

    // 收集 tmplHeader 的直接子节点（按 kiwi 数组顺序）
    if (tmpl.tmplHeader && tmpl.tmplHeader->guid()) {
        uint32_t hs = tmpl.tmplHeader->guid()->sessionID() ? *tmpl.tmplHeader->guid()->sessionID() : 0;
        uint32_t hl = tmpl.tmplHeader->guid()->localID()   ? *tmpl.tmplHeader->guid()->localID()   : 0;
        auto it = pmap.find(gkStr(hs, hl));
        if (it != pmap.end())
            for (auto *c : it->second) tmpl.tmplHdrChildren.push_back(c);
    }

    // 收集 tmplCell 的直接子节点（按 kiwi 数组顺序）
    if (tmpl.tmplCell && tmpl.tmplCell->guid()) {
        uint32_t cs2 = tmpl.tmplCell->guid()->sessionID() ? *tmpl.tmplCell->guid()->sessionID() : 0;
        uint32_t cl2 = tmpl.tmplCell->guid()->localID()   ? *tmpl.tmplCell->guid()->localID()   : 0;
        auto it = pmap.find(gkStr(cs2, cl2));
        if (it != pmap.end())
            for (auto *c : it->second) tmpl.tmplCellChildren.push_back(c);
    }

    if (!tmpl.valid()) {
        fprintf(stderr, "  [WARN] 表格模版缺少节点（需要: $Table/$Table-Column/Header/Body/Cell/矩形）\n");
        return false;
    }

    // 收集结构性节点 GUID（BFS 从 tmplRoot 出发，含所有后代）
    {
        std::set<std::string> structGuids;
        std::queue<std::string> bfsQ;

        auto enqueue = [&](const PixsoNode *n) {
            if (!n || !n->guid()) return;
            uint32_t s = n->guid()->sessionID() ? *n->guid()->sessionID() : 0;
            uint32_t l = n->guid()->localID()   ? *n->guid()->localID()   : 0;
            std::string key = gkStr(s, l);
            if (structGuids.insert(key).second) bfsQ.push(key);
        };

        enqueue(tmpl.tmplRoot);
        while (!bfsQ.empty()) {
            std::string pk = bfsQ.front(); bfsQ.pop();
            auto it = pmap.find(pk);
            if (it != pmap.end())
                for (const PixsoNode *ch : it->second) enqueue(ch);
        }

        // 其余非 CANVAS、非结构性节点 → library
        for (uint32_t i = 0; i < nodes->size(); i++) {
            const PixsoNode &n = (*nodes)[i];
            if (n.type() && *n.type() == NodeType::CANVAS) continue;
            if (!n.guid()) continue;
            uint32_t s = n.guid()->sessionID() ? *n.guid()->sessionID() : 0;
            uint32_t l = n.guid()->localID()   ? *n.guid()->localID()   : 0;
            if (structGuids.count(gkStr(s, l))) continue;
            tmpl.libraryNodes.push_back(&n);
        }
        printf("  表格模版: 结构节点 %zu，library 节点 %zu\n",
               structGuids.size(), tmpl.libraryNodes.size());
    }

    // 提取默认尺寸
    if (tmpl.tmplColumn->size() && tmpl.tmplColumn->size()->x())
        tmpl.colWidth = *tmpl.tmplColumn->size()->x();
    if (tmpl.tmplHeader->size() && tmpl.tmplHeader->size()->y())
        tmpl.headerHeight = *tmpl.tmplHeader->size()->y();
    if (tmpl.tmplCell->size() && tmpl.tmplCell->size()->y())
        tmpl.rowHeight = *tmpl.tmplCell->size()->y();

    printf("  表格模版: colWidth=%.0f headerHeight=%.0f rowHeight=%.0f\n",
           tmpl.colWidth, tmpl.headerHeight, tmpl.rowHeight);
    return true;
}

// "不覆盖"哨兵（位置和尺寸均 >= 0，故用极小负值安全区分）
static const float kNO = -1e30f;
static bool isKNO(float v) { return v < -1e29f; }

// 从模版节点浅拷贝到 dst，只覆盖 GUID / parentIndex / transform / size，
// 其余视觉字段（fills/strokes/stackMode/padding 等）全部继承自 src。
static void cloneStructNode(
    kiwi::MemoryPool &pool,
    PixsoNode        &dst,
    const PixsoNode  &src,
    uint32_t newS, uint32_t newL,
    uint32_t parentS, uint32_t parentL,
    const std::string &pos,
    float overX, float overY,   // kNO = 保留模版值
    float overW, float overH,   // kNO = 保留模版值
    const std::map<int32_t,int32_t> &blobRemap)
{
    dst = src;  // 浅拷贝：复制所有字段（含指向模版 pool 的指针）
    dst.set_guid(makeGUID(pool, newS, newL));
    dst.set_parentIndex(makeParent(pool, parentS, parentL, pos));

    // 覆盖 transform
    if (!isKNO(overX) || !isKNO(overY)) {
        float x = isKNO(overX) ? (src.transform() && src.transform()->m02() ? *src.transform()->m02() : 0.f) : overX;
        float y = isKNO(overY) ? (src.transform() && src.transform()->m12() ? *src.transform()->m12() : 0.f) : overY;
        Matrix *mat = pool.allocate<Matrix>(); new(mat) Matrix();
        mat->set_m00(1.f); mat->set_m01(0.f); mat->set_m02(x);
        mat->set_m10(0.f); mat->set_m11(1.f); mat->set_m12(y);
        dst.set_transform(mat);
    }

    // 覆盖 size
    if (!isKNO(overW) || !isKNO(overH)) {
        float w = isKNO(overW) ? (src.size() && src.size()->x() ? *src.size()->x() : 0.f) : overW;
        float h = isKNO(overH) ? (src.size() && src.size()->y() ? *src.size()->y() : 0.f) : overH;
        Vector *sz = pool.allocate<Vector>(); new(sz) Vector();
        sz->set_x(w); sz->set_y(h);
        dst.set_size(sz);
    }

    remapBlobsInNode(dst, blobRemap);
}

// 前向声明（fillTableNode 调用 fillLayerNode 处理非表格图层）
static void fillLayerNode(kiwi::MemoryPool &pool,
                          kiwi::Array<PixsoNode> &arr,
                          uint32_t &idx,
                          const DslLayer &layer,
                          uint32_t parentS, uint32_t parentL,
                          int childPos,
                          const SymbolMap &symMap,
                          const std::map<CompSetData*, ChildrenMap> &childMaps,
                          GuidCounter &gc,
                          TableTemplate *tmpl,
                          const std::map<int32_t,int32_t> *tmplBlobRemap);

// 将一个 DSL table 图层转为完整的 PixsoNode 序列（clone 模版节点 + 填 cell 内容）
static void fillTableNode(
    kiwi::MemoryPool &pool,
    kiwi::Array<PixsoNode> &arr,
    uint32_t &idx,
    const DslLayer &layer,
    uint32_t parentS, uint32_t parentL,
    int childPos,
    const SymbolMap &symMap,
    const std::map<CompSetData*, ChildrenMap> &childMaps,
    TableTemplate &tmpl,
    const std::map<int32_t,int32_t> &blobRemap,
    GuidCounter &gc)
{
    int nCols = (int)layer.tableData.headers.size();
    int nRows = (int)layer.tableData.rows.size();

    // 尺寸优先级：DSL 显式值 > box.width 均分 > 模版默认值
    float colW  = (layer.tableData.colWidth > 0)
                    ? layer.tableData.colWidth
                    : (nCols > 0 && layer.box.w > 0)
                        ? layer.box.w / (float)nCols
                        : tmpl.colWidth;
    float rowH  = (layer.tableData.rowHeight    > 0) ? layer.tableData.rowHeight    : tmpl.rowHeight;
    float hdrH  = (layer.tableData.headerHeight > 0) ? layer.tableData.headerHeight : tmpl.headerHeight;

    // body 高度：读取模版 $Table-Col-Body 的 stackPaddingTop/Bottom
    float padTop    = (tmpl.tmplBody->stackPaddingTop()    ? *tmpl.tmplBody->stackPaddingTop()    : 0.f);
    float padBot    = (tmpl.tmplBody->stackPaddingBottom() ? *tmpl.tmplBody->stackPaddingBottom() : 0.f);
    float bodySpacing = (tmpl.tmplBody->stackSpacing()     ? *tmpl.tmplBody->stackSpacing()       : 0.f);
    float bodyH = padTop + (float)nRows * rowH +
                  (nRows > 1 ? (float)(nRows - 1) * bodySpacing : 0.f) + padBot;

    float colH  = hdrH + bodyH;

    // 根 FRAME 的 stackSpacing（$Table 与 矩形 之间的间隔）
    float rootGap = (tmpl.tmplRoot->stackSpacing() ? *tmpl.tmplRoot->stackSpacing() : 12.f);
    // 矩形高度
    float rectH   = (tmpl.tmplRect->size() && tmpl.tmplRect->size()->y()
                     ? *tmpl.tmplRect->size()->y() : 50.f);

    float tableW  = (float)nCols * colW;
    float tableH  = colH + rootGap + rectH;

    auto nextGuid = [&]() { return gc.next(); };

    // === 1. 根 "表格" FRAME（clone tmplRoot）===
    auto [rootS, rootL] = gc.next();
    {
        PixsoNode &n = arr[idx++];
        cloneStructNode(pool, n, *tmpl.tmplRoot,
                        rootS, rootL,
                        parentS, parentL, makePos(childPos),
                        layer.box.x, layer.box.y,
                        tableW, tableH,
                        blobRemap);
        n.set_name(pool.string(layer.name.c_str()));
        n.set_visible(layer.visible);
        n.set_opacity(layer.opacity);
    }

    // === 2. $Table FRAME（clone tmplTable）===
    auto [tableNS, tableNL] = nextGuid();
    {
        PixsoNode &n = arr[idx++];
        cloneStructNode(pool, n, *tmpl.tmplTable,
                        tableNS, tableNL,
                        rootS, rootL, makePos(0),
                        0.f, 0.f,
                        tableW, colH,
                        blobRemap);
    }

    // === 3. 每列 ===
    for (int ci = 0; ci < nCols; ci++) {
        float colX = (float)ci * colW;
        const std::string &hdrText =
            (ci < (int)layer.tableData.headers.size()) ? layer.tableData.headers[ci] : "";

        // $Table-Column
        auto [colS, colL] = nextGuid();
        {
            PixsoNode &n = arr[idx++];
            cloneStructNode(pool, n, *tmpl.tmplColumn,
                            colS, colL,
                            tableNS, tableNL, makePos(ci),
                            colX, 0.f,
                            colW, colH,
                            blobRemap);
        }

        // $Table-Col-Header
        auto [hdrS, hdrL] = nextGuid();
        {
            PixsoNode &n = arr[idx++];
            cloneStructNode(pool, n, *tmpl.tmplHeader,
                            hdrS, hdrL,
                            colS, colL, makePos(0),
                            kNO, kNO,
                            colW, kNO,
                            blobRemap);
        }

        // Header 子节点（按模版顺序）：TEXT 替换为列头文字，非 TEXT 同步 header 宽高
        for (int hi = 0; hi < (int)tmpl.tmplHdrChildren.size(); hi++) {
            const PixsoNode *ch = tmpl.tmplHdrChildren[hi];
            bool isText = ch->type() && *ch->type() == NodeType::TEXT;
            auto [cS, cL] = nextGuid();
            PixsoNode &n = arr[idx++];
            cloneStructNode(pool, n, *ch, cS, cL,
                            hdrS, hdrL, makePos(hi),
                            kNO, kNO,
                            isText ? kNO : colW,   // 非 TEXT：宽跟随列宽
                            isText ? kNO : hdrH,   // 非 TEXT：高跟随列头高
                            blobRemap);
            // TEXT 节点：替换为 DSL 列头文字
            if (ch->type() && *ch->type() == NodeType::TEXT && !hdrText.empty()) {
                TextData *td = pool.allocate<TextData>(); new(td) TextData();
                td->set_characters(pool.string(hdrText.c_str()));
                uint32_t cc = 0;
                const uint8_t *sp = (const uint8_t*)hdrText.c_str();
                for (size_t bi = 0; bi < hdrText.size(); ) {
                    uint8_t c = sp[bi];
                    bi += (c < 0x80) ? 1 : (c < 0xE0) ? 2 : (c < 0xF0) ? 3 : 4;
                    cc++;
                }
                if (cc > 0) {
                    auto &ids = td->set_characterStyleIDs(pool, cc);
                    for (uint32_t j = 0; j < cc; j++) ids[j] = 0;
                }
                n.set_textData(td);
            }
        }

        // $Table-Col-Body
        auto [bodyS, bodyL] = nextGuid();
        {
            PixsoNode &n = arr[idx++];
            cloneStructNode(pool, n, *tmpl.tmplBody,
                            bodyS, bodyL,
                            colS, colL, makePos(1),
                            kNO, kNO,
                            colW, bodyH,
                            blobRemap);
        }

        // === 每行的格 ===
        for (int ri = 0; ri < nRows; ri++) {
            auto [cellS, cellL] = nextGuid();
            float cellY = padTop + (float)ri * (rowH + bodySpacing);
            const std::string &cellText =
                (ri < (int)layer.tableData.rows.size() &&
                 ci < (int)layer.tableData.rows[ri].size())
                ? layer.tableData.rows[ri][ci].textContent : "";

            // $Table-Cell（clone tmplCell）
            {
                PixsoNode &n = arr[idx++];
                cloneStructNode(pool, n, *tmpl.tmplCell,
                                cellS, cellL,
                                bodyS, bodyL, makePos(ri),
                                0.f, cellY,
                                colW, rowH,
                                blobRemap);
            }

            // Cell 子节点（按模版顺序）：TEXT 替换为 DSL cell 文字，非 TEXT 同步 cell 高度
            for (int ki = 0; ki < (int)tmpl.tmplCellChildren.size(); ki++) {
                const PixsoNode *ch = tmpl.tmplCellChildren[ki];
                bool isText = ch->type() && *ch->type() == NodeType::TEXT;
                auto [cS, cL] = nextGuid();
                PixsoNode &n = arr[idx++];
                cloneStructNode(pool, n, *ch, cS, cL,
                                cellS, cellL, makePos(ki),
                                kNO, kNO,
                                isText ? kNO : colW,  // 非 TEXT：宽跟随列宽
                                isText ? kNO : rowH,  // 非 TEXT：高跟随行高
                                blobRemap);
                // TEXT 节点：替换为 DSL cell 文字
                if (ch->type() && *ch->type() == NodeType::TEXT && !cellText.empty()) {
                    TextData *td = pool.allocate<TextData>(); new(td) TextData();
                    td->set_characters(pool.string(cellText.c_str()));
                    uint32_t cc = 0;
                    const uint8_t *sp = (const uint8_t*)cellText.c_str();
                    for (size_t bi = 0; bi < cellText.size(); ) {
                        uint8_t c = sp[bi];
                        bi += (c < 0x80) ? 1 : (c < 0xE0) ? 2 : (c < 0xF0) ? 3 : 4;
                        cc++;
                    }
                    if (cc > 0) {
                        auto &ids = td->set_characterStyleIDs(pool, cc);
                        for (uint32_t j = 0; j < cc; j++) ids[j] = 0;
                    }
                    n.set_textData(td);
                }
            }
        }
    }

    // === 4. 第二子节点（clone tmplRect，不修改任何位置/尺寸，原样克隆）===
    {
        auto [rectS, rectL] = nextGuid();
        PixsoNode &n = arr[idx++];
        cloneStructNode(pool, n, *tmpl.tmplRect,
                        rectS, rectL,
                        rootS, rootL, makePos(1),
                        kNO, kNO,
                        kNO, kNO,
                        blobRemap);
    }
}

// =============================================================================
// DSL 图层 → PixsoNode（写入预分配数组）
// =============================================================================

static void fillLayerNode(kiwi::MemoryPool &pool,
                          kiwi::Array<PixsoNode> &arr,
                          uint32_t &idx,
                          const DslLayer &layer,
                          uint32_t parentS, uint32_t parentL,
                          int childPos,
                          const SymbolMap &symMap,
                          const std::map<CompSetData*, ChildrenMap> &childMaps,
                          GuidCounter &gc,
                          TableTemplate *tmpl = nullptr,
                          const std::map<int32_t,int32_t> *tmplBlobRemap = nullptr) {
    // ── 表格类型：分发给 fillTableNode ──────────────────────────────────────
    if (layer.type == "table") {
        if (!tmpl || !tmpl->valid()) {
            fprintf(stderr, "  [WARN] table 节点 \"%s\" 需要 --table-template，写入占位 FRAME\n",
                    layer.name.c_str());
            // 填 1 个占位 FRAME，保持节点计数与 countLayerNodes 一致
            auto [nodeS, nodeL] = gc.next();
            PixsoNode &ph = arr[idx++];
            ph.set_type(NodeType::FRAME);
            ph.set_phase(NodePhase::CREATED);
            ph.set_guid(makeGUID(pool, nodeS, nodeL));
            ph.set_name(pool.string(layer.name.c_str()));
            ph.set_visible(false);
            ph.set_opacity(0.0f);
            ph.set_parentIndex(makeParent(pool, parentS, parentL, makePos(childPos)));
            Matrix *mat = pool.allocate<Matrix>(); new(mat) Matrix();
            mat->set_m00(1.f); mat->set_m01(0.f); mat->set_m02(layer.box.x);
            mat->set_m10(0.f); mat->set_m11(1.f); mat->set_m12(layer.box.y);
            ph.set_transform(mat);
            Vector *sz = pool.allocate<Vector>(); new(sz) Vector();
            sz->set_x(layer.box.w); sz->set_y(layer.box.h);
            ph.set_size(sz);
            return;
        }
        static const std::map<int32_t,int32_t> emptyRemap;
        fillTableNode(pool, arr, idx, layer, parentS, parentL, childPos,
                      symMap, childMaps, *tmpl,
                      tmplBlobRemap ? *tmplBlobRemap : emptyRemap, gc);
        return;
    }
    if (layer.type == "instance") {
        if (layer.symbolId.empty()) {
            fprintf(stderr, "  [WARN] INSTANCE \"%s\" (%s) symbol_id 为空，跳过\n",
                    layer.name.c_str(), layer.id.c_str());
            return;
        }
        auto [nodeS, nodeL] = gc.next();
        auto sgk = parseGK(layer.symbolId);
        PixsoNode &n = arr[idx++];

        n.set_type(NodeType::INSTANCE);
        n.set_phase(NodePhase::CREATED);
        n.set_guid(makeGUID(pool, nodeS, nodeL));
        n.set_name(pool.string(layer.name.c_str()));
        n.set_visible(layer.visible);
        n.set_opacity(layer.opacity);
        n.set_blendMode(mapBlendMode(layer.blendMode));
        n.set_parentIndex(makeParent(pool, parentS, parentL, makePos(childPos)));

        Matrix *mat = pool.allocate<Matrix>(); new(mat) Matrix();
        mat->set_m00(1.f); mat->set_m01(0.f); mat->set_m02(layer.box.x);
        mat->set_m10(0.f); mat->set_m11(1.f); mat->set_m12(layer.box.y);
        n.set_transform(mat);

        // 尺寸优先用 SYMBOL 节点自身的 size，DSL box 仅兜底
        float sizeW = layer.box.w, sizeH = layer.box.h;
        {
            auto smSz = symMap.find(layer.symbolId);
            if (smSz != symMap.end()) {
                const PixsoNode *sym = smSz->second.second;
                if (sym->size()) {
                    if (sym->size()->x()) sizeW = *sym->size()->x();
                    if (sym->size()->y()) sizeH = *sym->size()->y();
                }
            }
        }
        Vector *sz = pool.allocate<Vector>(); new(sz) Vector();
        sz->set_x(sizeW); sz->set_y(sizeH);
        n.set_size(sz);

        SymbolData *sd = pool.allocate<SymbolData>(); new(sd) SymbolData();
        sd->set_symbolID(makeGUID(pool, sgk.s, sgk.l));

        // symbolOverrides：存放用户显式覆盖的 delta 值（如文本覆盖）
        // 每条 override 对应一个 PixsoNode 槽位，guidPath = [目标节点 GUID]（单 GUID）
        {
            uint32_t ovCount = 0;
            for (const auto &ov : layer.overrides)
                if (ov.field == "text_content" && !ov.value.empty()) ovCount++;

            if (ovCount > 0) {
                auto &sovr = sd->set_symbolOverrides(pool, ovCount);
                uint32_t si = 0;
                for (const auto &ov : layer.overrides) {
                    if (ov.field != "text_content" || ov.value.empty()) continue;
                    auto ngk = parseGK(ov.nodeId);

                    // guidPath = [{node_guid}]
                    GUIDPath *gp = pool.allocate<GUIDPath>(); new(gp) GUIDPath();
                    auto &guids = gp->set_guids(pool, 1);
                    guids[0].set_sessionID(ngk.s);
                    guids[0].set_localID(ngk.l);
                    sovr[si].set_guidPath(gp);

                    // textData.characters + characterStyleIDs
                    TextData *td = pool.allocate<TextData>(); new(td) TextData();
                    td->set_characters(pool.string(ov.value.c_str()));
                    uint32_t charCount = 0;
                    const uint8_t *sp = (const uint8_t*)ov.value.c_str();
                    size_t slen = ov.value.size();
                    for (size_t bi = 0; bi < slen; ) {
                        uint8_t c = sp[bi];
                        if      (c < 0x80)           bi += 1;
                        else if ((c & 0xE0) == 0xC0) bi += 2;
                        else if ((c & 0xF0) == 0xE0) bi += 3;
                        else                         bi += 4;
                        charCount++;
                    }
                    if (charCount > 0) {
                        auto &ids = td->set_characterStyleIDs(pool, charCount);
                        for (uint32_t j = 0; j < charCount; j++) ids[j] = 0;
                    }
                    sovr[si].set_textData(td);
                    si++;
                }
            }
        }
        n.set_symbolData(sd);

        // derivedSymbolData：每个槽位填入完整 guidPath（Pixso 靠此定位后代节点）
        auto smIt = symMap.find(layer.symbolId);
        if (smIt != symMap.end()) {
            CompSetData *csData = smIt->second.first;
            const PixsoNode *symNode = smIt->second.second;
            auto cmIt = childMaps.find(csData);
            if (cmIt != childMaps.end()) {
                uint32_t cnt = computeDerivedCount(*symNode, cmIt->second);
                if (cnt > 0) {
                    auto &dsd = n.set_derivedSymbolData(pool, cnt);
                    uint32_t dsdIdx = 0;
                    std::vector<std::pair<uint32_t,uint32_t>> path;
                    fillDerivedSlots(pool, dsd, dsdIdx, *symNode, cmIt->second, path);
                }
            }
        }
        return;
    }

    auto [nodeS, nodeL] = gc.next();
    PixsoNode &n = arr[idx++];

    n.set_type(mapLayerType(layer.type));
    n.set_phase(NodePhase::CREATED);
    n.set_guid(makeGUID(pool, nodeS, nodeL));
    n.set_name(pool.string(layer.name.c_str()));
    n.set_visible(layer.visible);
    n.set_opacity(layer.opacity);
    n.set_blendMode(mapBlendMode(layer.blendMode));
    n.set_parentIndex(makeParent(pool, parentS, parentL, makePos(childPos)));

    Matrix *mat = pool.allocate<Matrix>(); new(mat) Matrix();
    mat->set_m00(1.f); mat->set_m01(0.f); mat->set_m02(layer.box.x);
    mat->set_m10(0.f); mat->set_m11(1.f); mat->set_m12(layer.box.y);
    n.set_transform(mat);

    Vector *sz = pool.allocate<Vector>(); new(sz) Vector();
    sz->set_x(layer.box.w); sz->set_y(layer.box.h);
    n.set_size(sz);

    // 圆角处理：独立圆角优先，否则使用统一圆角
    if (layer.cornerRadiiIndependent) {
        n.set_rectangleCornerRadiiIndependent(true);
        n.set_rectangleTopLeftCornerRadius(layer.cornerRadiusTL);
        n.set_rectangleTopRightCornerRadius(layer.cornerRadiusTR);
        n.set_rectangleBottomRightCornerRadius(layer.cornerRadiusBR);
        n.set_rectangleBottomLeftCornerRadius(layer.cornerRadiusBL);
    } else if (layer.cornerRadius != 0.0f) {
        n.set_cornerRadius(layer.cornerRadius);
    }

    // PlaceholderMeta → pluginData（所有图层类型均处理）
    if (layer.placeholderEnabled) {
        // guid = id 中冒号换下划线（与 converter.js idToGuid 一致）
        std::string guid = layer.id;
        for (char &c : guid) if (c == ':') c = '_';
        
        // note = 文件名（svg/png 文件在 zip 包中）
        std::string noteFile = guid;
        noteFile += (layer.placeholderType == "svg") ? ".svg" : ".png";
        
        // 构造 value JSON：{"is_placeholder":true,"replacement_type":"...","note":"..."}
        std::string val = "{\"is_placeholder\":true,\"replacement_type\":\"";
        val += layer.placeholderType;
        val += "\",\"note\":\"";
        val += noteFile;
        val += "\"}";
        
        auto &pd = n.set_pluginData(pool, 1);
        pd[0].set_pluginID(pool.string("pix-dsl"));
        pd[0].set_key(pool.string("placeholder_meta"));
        pd[0].set_value(pool.string(val.c_str()));
    }

    if (!layer.fills.empty()) {
        auto &paints = n.set_fillPaints(pool, (uint32_t)layer.fills.size());
        for (size_t i = 0; i < layer.fills.size(); i++) {
            const DslFill &f = layer.fills[i];
            Paint &p = paints[i];
            PaintType pt = PaintType::SOLID;
            if      (f.type == "gradient_linear") pt = PaintType::GRADIENT_LINEAR;
            else if (f.type == "gradient_radial")  pt = PaintType::GRADIENT_RADIAL;
            else if (f.type == "image")            pt = PaintType::IMAGE;
            p.set_type(pt);
            p.set_visible(f.visible);
            p.set_opacity(f.opacity);
            p.set_blendMode(BlendMode::NORMAL);
            if (!f.color.empty()) {
                Color *c = parseColor(pool, f.color);
                if (c) p.set_color(c);
            }
        }
    }

    // strokes → strokePaints + strokeWeight
    if (!layer.strokes.empty()) {
        auto &paints = n.set_strokePaints(pool, (uint32_t)layer.strokes.size());
        for (size_t i = 0; i < layer.strokes.size(); i++) {
            const DslStroke &s = layer.strokes[i];
            Paint &p = paints[i];
            PaintType pt = PaintType::SOLID;
            if (s.type == "gradient_linear") pt = PaintType::GRADIENT_LINEAR;
            else if (s.type == "gradient_radial") pt = PaintType::GRADIENT_RADIAL;
            p.set_type(pt);
            p.set_visible(s.visible);
            p.set_opacity(s.opacity);
            p.set_blendMode(BlendMode::NORMAL);
            if (!s.color.empty()) {
                Color *c = parseColor(pool, s.color);
                if (c) p.set_color(c);
            }
        }
        // 描边宽度（默认为1，DSL中stroke_width可选）
        n.set_strokeWeight(layer.strokeWidth > 0 ? layer.strokeWidth : 1.0f);
    }

    if (layer.autoLayout.enabled) {
        const DslAutoLayout &al = layer.autoLayout;
        n.set_stackMode(al.direction == "horizontal" ? StackMode::HORIZONTAL : StackMode::VERTICAL);
        if (al.gap != 0.0f) n.set_stackSpacing(al.gap);
        if (al.counterGap != 0.0f) n.set_stackCounterSpacing(al.counterGap);
        n.set_stackPaddingTop(al.padTop);
        n.set_stackPaddingRight(al.padRight);
        n.set_stackPaddingBottom(al.padBottom);
        n.set_stackPaddingLeft(al.padLeft);

        // align_items → stackCounterAlign（垂直于主轴方向的对齐）
        {
            StackCounterAlign ca = StackCounterAlign::MIN;
            if      (al.alignItems == "center")  ca = StackCounterAlign::CENTER;
            else if (al.alignItems == "max")     ca = StackCounterAlign::MAX;
            else if (al.alignItems == "stretch") ca = StackCounterAlign::STRETCH;
            n.set_stackCounterAlign(ca);
        }
        // justify_content → stackJustify（主轴方向的分布）
        {
            StackJustify sj = StackJustify::MIN;
            if      (al.justifyContent == "center")       sj = StackJustify::CENTER;
            else if (al.justifyContent == "max")          sj = StackJustify::MAX;
            else if (al.justifyContent == "space_evenly") sj = StackJustify::SPACE_EVENLY;
            n.set_stackJustify(sj);
        }
        n.set_stackWrap(al.wrap ? WrapMode::WRAP : WrapMode::NO_WRAP);
    }

    if (layer.type == "text") {
        FontName *fn = pool.allocate<FontName>(); new(fn) FontName();
        fn->set_family(pool.string(layer.textFontFamily.c_str()));
        fn->set_style(pool.string(layer.textFontStyle.c_str()));
        fn->set_postscript(pool.string(""));
        n.set_fontName(fn);

        n.set_fontSize(layer.textFontSize);

        // text 颜色写入 fillPaints（覆盖上方 fills，text 节点颜色以 textColor 为准）
        if (!layer.textColor.empty()) {
            Color *tc = parseColor(pool, layer.textColor);
            if (tc) {
                auto &fp = n.set_fillPaints(pool, 1);
                fp[0].set_type(PaintType::SOLID);
                fp[0].set_visible(true);
                fp[0].set_opacity(1.0f);
                fp[0].set_blendMode(BlendMode::NORMAL);
                fp[0].set_color(tc);
            }
        }

        if (!layer.textContent.empty()) {
            TextData *td = pool.allocate<TextData>(); new(td) TextData();
            td->set_characters(pool.string(layer.textContent.c_str()));

            // 统计 Unicode codepoint 数（UTF-8 解码）
            uint32_t charCount = 0;
            const uint8_t *sp = (const uint8_t*)layer.textContent.c_str();
            size_t slen = layer.textContent.size();
            for (size_t bi = 0; bi < slen; ) {
                uint8_t c = sp[bi];
                if      (c < 0x80)           bi += 1;
                else if ((c & 0xE0) == 0xC0) bi += 2;
                else if ((c & 0xF0) == 0xE0) bi += 3;
                else                         bi += 4;
                charCount++;
            }
            if (charCount > 0) {
                auto &ids = td->set_characterStyleIDs(pool, charCount);
                for (uint32_t i = 0; i < charCount; i++) ids[i] = 0;
            }

            // styleOverrideTable[0]：字号 + 字体 + 文字颜色
            auto &table = td->set_styleOverrideTable(pool, 1);
            TextStyleData &tsd = table[0];
            tsd.set_styleID(0);
            tsd.set_fontSize(layer.textFontSize);

            FontName *fn2 = pool.allocate<FontName>(); new(fn2) FontName();
            fn2->set_family(pool.string(layer.textFontFamily.c_str()));
            fn2->set_style(pool.string(layer.textFontStyle.c_str()));
            fn2->set_postscript(pool.string(""));
            tsd.set_fontName(fn2);

            Color *tc2 = parseColor(pool, layer.textColor);
            if (tc2) {
                auto &fp2 = tsd.set_fillPaints(pool, 1);
                fp2[0].set_type(PaintType::SOLID);
                fp2[0].set_visible(true);
                fp2[0].set_opacity(1.0f);
                fp2[0].set_blendMode(BlendMode::NORMAL);
                fp2[0].set_color(tc2);
            }

            n.set_textData(td);
        }
        // align_h → TextAlignHorizontal
        {
            TextAlignHorizontal h = TextAlignHorizontal::LEFT;
            if      (layer.textAlignH == "center")    h = TextAlignHorizontal::CENTER;
            else if (layer.textAlignH == "right")     h = TextAlignHorizontal::RIGHT;
            else if (layer.textAlignH == "justified") h = TextAlignHorizontal::JUSTIFIED;
            n.set_textAlignHorizontal(h);
        }
        // align_v → TextAlignVertical
        {
            TextAlignVertical v = TextAlignVertical::TOP;
            if      (layer.textAlignV == "center") v = TextAlignVertical::CENTER;
            else if (layer.textAlignV == "bottom") v = TextAlignVertical::BOTTOM;
            n.set_textAlignVertical(v);
        }
        // letter_spacing → PixsoNode + styleOverrideTable[0]（非 0 才写）
        if (layer.textLetterSpacing != 0.0f) {
            Number *ls = pool.allocate<Number>(); new(ls) Number();
            ls->set_value(layer.textLetterSpacing);
            ls->set_units(NumberUnits::PIXELS);
            n.set_letterSpacing(ls);
            // 同步写入 styleOverrideTable（若已创建）
            auto *tbl = n.textData() ? n.textData()->styleOverrideTable() : nullptr;
            if (tbl && tbl->size() > 0) {
                Number *ls2 = pool.allocate<Number>(); new(ls2) Number();
                ls2->set_value(layer.textLetterSpacing);
                ls2->set_units(NumberUnits::PIXELS);
                (*tbl)[0].set_letterSpacing(ls2);
            }
        }
        // line_height → PixsoNode + styleOverrideTable[0]（非 auto 才写）
        if (layer.textLineHeight != "auto" && !layer.textLineHeight.empty()) {
            float lhVal = std::stof(layer.textLineHeight);
            Number *lh = pool.allocate<Number>(); new(lh) Number();
            lh->set_value(lhVal);
            lh->set_units(NumberUnits::PIXELS);
            n.set_lineHeight(lh);
            // 同步写入 styleOverrideTable（若已创建）
            auto *tbl = n.textData() ? n.textData()->styleOverrideTable() : nullptr;
            if (tbl && tbl->size() > 0) {
                Number *lh2 = pool.allocate<Number>(); new(lh2) Number();
                lh2->set_value(lhVal);
                lh2->set_units(NumberUnits::PIXELS);
                (*tbl)[0].set_lineHeight(lh2);
            }
        }
    }

    for (size_t i = 0; i < layer.children.size(); i++)
        fillLayerNode(pool, arr, idx, layer.children[i], nodeS, nodeL, (int)i,
                      symMap, childMaps, gc, tmpl, tmplBlobRemap);
}

// =============================================================================
// 组件 key 收集
// =============================================================================

static void collectCompSetKeys(const DslLayer &layer, std::set<std::string> &keys) {
    if (layer.type == "instance" && !layer.componentSetKey.empty())
        keys.insert(layer.componentSetKey);
    for (auto &child : layer.children)
        collectCompSetKeys(child, keys);
}

// =============================================================================
// Blob 辅助：收集 / 重映射
// =============================================================================

static void collectBlobsFromNode(const PixsoNode &n, std::set<int32_t> &out) {
    auto addPaths = [&](const kiwi::Array<Path> *arr) {
        if (!arr) return;
        for (uint32_t i = 0; i < arr->size(); i++)
            if ((*arr)[i].blobIndex()) out.insert(*(*arr)[i].blobIndex());
    };
    addPaths(n.fillGeometry());
    addPaths(n.strokeGeometry());
    if (n.vectorData() && n.vectorData()->vectorNetworkBlob())
        out.insert(*n.vectorData()->vectorNetworkBlob());
    if (n.textData() && n.textData()->glyphs()) {
        const auto *g = n.textData()->glyphs();
        for (uint32_t i = 0; i < g->size(); i++)
            if ((*g)[i].blobIndex()) out.insert(*(*g)[i].blobIndex());
    }
    if (n.symbolData() && n.symbolData()->symbolOverrides()) {
        const auto *ov = n.symbolData()->symbolOverrides();
        for (uint32_t i = 0; i < ov->size(); i++) collectBlobsFromNode((*ov)[i], out);
    }
    if (n.derivedSymbolData()) {
        const auto *ds = n.derivedSymbolData();
        for (uint32_t i = 0; i < ds->size(); i++) collectBlobsFromNode((*ds)[i], out);
    }
}

static void remapBlobsInNode(PixsoNode &n, const std::map<int32_t, int32_t> &remap) {
    if (remap.empty()) return;
    auto fixPaths = [&](kiwi::Array<Path> *arr) {
        if (!arr) return;
        for (uint32_t i = 0; i < arr->size(); i++) {
            Path &p = (*arr)[i];
            if (p.blobIndex()) {
                auto it = remap.find(*p.blobIndex());
                if (it != remap.end()) p.set_blobIndex(it->second);
            }
        }
    };
    fixPaths(n.fillGeometry());
    fixPaths(n.strokeGeometry());
    if (n.vectorData() && n.vectorData()->vectorNetworkBlob()) {
        auto it = remap.find(*n.vectorData()->vectorNetworkBlob());
        if (it != remap.end()) n.vectorData()->set_vectorNetworkBlob(it->second);
    }
    if (n.textData() && n.textData()->glyphs()) {
        auto *g = n.textData()->glyphs();
        for (uint32_t i = 0; i < g->size(); i++) {
            Glyph &gl = (*g)[i];
            if (gl.blobIndex()) {
                auto it = remap.find(*gl.blobIndex());
                if (it != remap.end()) gl.set_blobIndex(it->second);
            }
        }
    }
    if (n.symbolData() && n.symbolData()->symbolOverrides()) {
        auto *ov = n.symbolData()->symbolOverrides();
        for (uint32_t i = 0; i < ov->size(); i++) remapBlobsInNode((*ov)[i], remap);
    }
    if (n.derivedSymbolData()) {
        auto *ds = n.derivedSymbolData();
        for (uint32_t i = 0; i < ds->size(); i++) remapBlobsInNode((*ds)[i], remap);
    }
}

// =============================================================================
// 构建完整 PixsoMsg
//
// 节点顺序：
//   可见 CANVAS {0,1}/{0,3}/{0,4}... + 该 page 下的图层（DFS 前序）
//   隐藏 CANVAS {0,2}（internalOnly=true，供组件库节点挂载）
//   组件集全量节点（全局 GUID 去重，跳过 CANVAS，孤根改挂到 {0,2}）
// =============================================================================

static std::vector<uint8_t> buildMsg(
        kiwi::MemoryPool &pool,
        const DslDoc &doc,
        std::vector<std::unique_ptr<CompSetData>> &compSets,
        TableTemplate *tmpl = nullptr) {

    // compNodeCount：全局 GUID 去重 + 跳过 CANVAS，与下方写入逻辑保持一致
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

    uint32_t total = countTotal(doc, compNodeCount, tmpl);

    // 建 SymbolMap 和各组件集的 ChildrenMap
    SymbolMap symMap;
    std::map<CompSetData*, ChildrenMap> childMaps;
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

    PixsoMsg out;
    out.set_type(PixsoMsgType::FIC_DOCUMENT);
    auto &arr = out.set_pixsoNodes(pool, total);
    uint32_t idx = 0;

    // 合并 blobs（顺序拼接，按偏移建重映射，不按内容去重以保证下标准确）
    std::vector<std::vector<uint8_t>>                mergedBlobs;
    std::map<CompSetData*, std::map<int32_t,int32_t>> blobRemaps;

    for (auto &cs : compSets) {
        auto *blobs = cs->msg.blobs();
        if (!blobs || blobs->size() == 0) continue;
        auto &remap = blobRemaps[cs.get()];
        int32_t offset = (int32_t)mergedBlobs.size();
        for (uint32_t i = 0; i < blobs->size(); i++) {
            remap[(int32_t)i] = offset + (int32_t)i;
            const auto *bytes = (*blobs)[i].bytes();
            if (bytes && bytes->size() > 0) {
                mergedBlobs.push_back(
                    std::vector<uint8_t>(&(*bytes)[0], &(*bytes)[0] + bytes->size()));
            } else {
                mergedBlobs.push_back({});  // 保留空槽，维持下标对齐
            }
        }
    }

    // ── 合并表格模版 blobs（在 CompSet blobs 之后）────────────────────────────
    std::map<int32_t,int32_t> tmplBlobRemap;
    if (tmpl && tmpl->valid()) {
        auto *tmplBlobs = tmpl->msg.blobs();
        if (tmplBlobs && tmplBlobs->size() > 0) {
            int32_t offset = (int32_t)mergedBlobs.size();
            for (uint32_t i = 0; i < tmplBlobs->size(); i++) {
                tmplBlobRemap[(int32_t)i] = offset + (int32_t)i;
                const auto *bytes = (*tmplBlobs)[i].bytes();
                if (bytes && bytes->size() > 0)
                    mergedBlobs.push_back(std::vector<uint8_t>(&(*bytes)[0], &(*bytes)[0] + bytes->size()));
                else
                    mergedBlobs.push_back({});
            }
            printf("  表格模版 blobs: %u 条（offset=%d）\n", tmplBlobs->size(), offset);
        }
    }

    if (!mergedBlobs.empty()) {
        auto &outBlobs = out.set_blobs(pool, (uint32_t)mergedBlobs.size());
        for (size_t i = 0; i < mergedBlobs.size(); i++) {
            if (!mergedBlobs[i].empty()) {
                auto &dstB = outBlobs[i].set_bytes(pool, (uint32_t)mergedBlobs[i].size());
                for (size_t j = 0; j < mergedBlobs[i].size(); j++)
                    dstB[j] = mergedBlobs[i][j];
            }
        }
        printf("  merged blobs: %zu 条\n", mergedBlobs.size());
    }

    // ── DSL 节点 session ID：比所有组件集（含表格模版）中最大 session 大 1，
    // 保证与组件库 GUID 完全不冲突。
    uint32_t maxCompSession = 1;
    for (auto &cs : compSets) {
        auto *nodes = cs->msg.pixsoNodes();
        if (!nodes) continue;
        for (uint32_t i = 0; i < nodes->size(); i++) {
            const PixsoNode &n = (*nodes)[i];
            if (n.guid() && n.guid()->sessionID())
                maxCompSession = std::max(maxCompSession, *n.guid()->sessionID());
        }
    }
    if (tmpl && tmpl->valid()) {
        auto *nodes = tmpl->msg.pixsoNodes();
        if (nodes) {
            for (uint32_t i = 0; i < nodes->size(); i++) {
                const PixsoNode &n = (*nodes)[i];
                if (n.guid() && n.guid()->sessionID())
                    maxCompSession = std::max(maxCompSession, *n.guid()->sessionID());
            }
        }
    }
    GuidCounter gc;
    gc.session = maxCompSession + 1;

    // ── 可见 CANVAS + 图层（每个 DSL page）──────────────────────────────────
    // GUID 规律：page 0 → {0,1}，page 1 → {0,3}，page 2 → {0,4}，跳过 {0,2}
    for (size_t pi = 0; pi < doc.pages.size(); pi++) {
        const DslPage &page = doc.pages[pi];
        uint32_t canvasL = (pi == 0) ? 1u : (uint32_t)(pi + 2);

        PixsoNode &cv = arr[idx++];
        cv.set_type(NodeType::CANVAS);
        cv.set_phase(NodePhase::CREATED);
        cv.set_guid(makeGUID(pool, 0, canvasL));
        cv.set_name(pool.string(page.name.c_str()));
        cv.set_parentIndex(makeParent(pool, 0, 0, "!"));

        for (size_t li = 0; li < page.layers.size(); li++)
            fillLayerNode(pool, arr, idx, page.layers[li], 0, canvasL, (int)li,
                          symMap, childMaps, gc, tmpl, &tmplBlobRemap);
    }

    // ── 隐藏 CANVAS {0,2}（组件库节点的挂载点）──────────────────────────────
    {
        PixsoNode &hv = arr[idx++];
        hv.set_type(NodeType::CANVAS);
        hv.set_phase(NodePhase::CREATED);
        hv.set_guid(makeGUID(pool, 0, 2));
        hv.set_name(pool.string("Internal Only Canvas"));
        hv.set_internalOnly(true);
        hv.set_parentIndex(makeParent(pool, 0, 0, "~"));
    }

    // ── 组件集全量节点 ────────────────────────────────────────────────────────
    // writtenGuids：跨组件集全局去重，防止共享子组件（如 Icon）被重复写入
    std::set<std::string> writtenGuids;

    for (auto &cs : compSets) {
        auto *nodes = cs->msg.pixsoNodes();
        if (!nodes) continue;
        uint32_t N = nodes->size();

        // guidSet：本组件集非 CANVAS 节点的 GUID 集合，用于判断孤根
        // CANVAS 节点不写入输出，故不纳入——以 CANVAS 为 parent 的根节点
        // 会被判定为孤根，自动改挂到隐藏页 {0,2}
        std::set<std::pair<uint32_t, uint32_t>> guidSet;
        for (uint32_t i = 0; i < N; i++) {
            const PixsoNode &n = (*nodes)[i];
            if (n.type() && *n.type() == NodeType::CANVAS) continue;
            if (n.guid() && n.guid()->sessionID() && n.guid()->localID())
                guidSet.insert({*n.guid()->sessionID(), *n.guid()->localID()});
        }

        auto brmIt = blobRemaps.find(cs.get());
        const std::map<int32_t,int32_t> *csRemap =
            (brmIt != blobRemaps.end() && !brmIt->second.empty())
            ? &brmIt->second : nullptr;

        for (uint32_t i = 0; i < N; i++) {
            const PixsoNode &orig = (*nodes)[i];

            // 跳过组件集内的 CANVAS 节点，避免破坏文件结构
            if (orig.type() && *orig.type() == NodeType::CANVAS) continue;

            // 全局 GUID 去重
            uint32_t gs = (orig.guid() && orig.guid()->sessionID()) ? *orig.guid()->sessionID() : 0;
            uint32_t gl = (orig.guid() && orig.guid()->localID())   ? *orig.guid()->localID()   : 0;
            if (!writtenGuids.insert(gkStr(gs, gl)).second) continue;

            // 孤根：parent 不在本组件集内 → 改挂到隐藏页 {0,2}
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

    // ── 表格模版 library 节点（组件定义，原样输出到 {0,2}）────────────────────
    if (tmpl && tmpl->valid() && !tmpl->libraryNodes.empty()) {
        for (const PixsoNode *libNode : tmpl->libraryNodes) {
            arr[idx] = *libNode;
            if (!tmplBlobRemap.empty())
                remapBlobsInNode(arr[idx], tmplBlobRemap);
            idx++;
        }
    }

    if (idx != total)
        fprintf(stderr, "[ERROR] 节点计数不一致: 预期 %u，实际 %u\n", total, idx);

    kiwi::ByteBuffer bb;
    if (!out.encode(bb)) { fprintf(stderr, "encode failed\n"); return {}; }
    return std::vector<uint8_t>(bb.data(), bb.data() + bb.size());
}
