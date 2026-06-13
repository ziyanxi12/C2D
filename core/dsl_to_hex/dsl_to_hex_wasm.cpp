#define IMPLEMENT_KIWI_H
#define IMPLEMENT_SCHEMA_H

#include "kiwi.h"
#include "pixso.h"
#include "zstd.h"

#include <emscripten/bind.h>

#include "dsl_core.h"

// NODERAWFS=1 使 fopen/fread 等系统调用直接路由到 Node.js fs，
// 无需挂载虚拟文件系统，也不需要把文件内容传进 WASM。

// =============================================================================
// WASM 导出函数
// =============================================================================

// dslToHex(dslJsonPath, componentDir, tableTemplatePath) → hex string（或含 missing 的 JSON）
// - dslJsonPath:       DSL JSON 文件的绝对/相对路径
// - componentDir:      组件 hex 目录路径（按 component_set_key 自动查找 {key}.txt）
// - tableTemplatePath: 表格模版 hex 文件路径（空字符串表示不使用表格功能）
std::string dslToHex(const std::string &dslJsonPath,
                     const std::string &componentDir,
                     const std::string &tableTemplatePath) {
    auto raw = readFile(dslJsonPath.c_str());
    if (raw.empty())
        return "{\"error\":\"cannot read DSL: " + dslJsonPath + "\"}";

    JsonParser jp((const char*)raw.data(), raw.size());
    JVal root = jp.parse();
    if (root.isNull()) return "{\"error\":\"JSON parse failed\"}";

    DslDoc doc = parseDoc(root);

    std::vector<std::unique_ptr<CompSetData>> compSets;
    std::string dir = componentDir;
    if (!dir.empty() && dir.back() != '/') dir += '/';

    std::set<std::string> keys;
    for (auto &page : doc.pages)
        for (auto &layer : page.layers)
            collectCompSetKeys(layer, keys);

    std::vector<std::string> missingKeys;
    for (auto &key : keys) {
        std::string path = dir + key + ".txt";
        auto cs = std::make_unique<CompSetData>();
        if (loadCompSet(path.c_str(), *cs)) {
            compSets.push_back(std::move(cs));
        } else {
            fprintf(stderr, "[ERROR] 组件集文件不存在: %s\n", path.c_str());
            missingKeys.push_back(key);
        }
    }

    // 加载表格模版（可选）
    std::unique_ptr<TableTemplate> tmpl;
    if (!tableTemplatePath.empty()) {
        tmpl = std::make_unique<TableTemplate>();
        if (!loadTableTemplate(tableTemplatePath.c_str(), *tmpl))
            tmpl.reset();
    }

    kiwi::MemoryPool pool;
    auto kiwiBin = buildMsg(pool, doc, compSets, tmpl.get());
    if (kiwiBin.empty()) return "{\"error\":\"buildMsg failed\"}";

    auto pixData = compressToPix(kiwiBin);
    if (pixData.empty()) return "{\"error\":\"compress failed\"}";

    std::string hexStr = "<!-- pixso binary data -->\n" + bytesToHex(pixData);

    if (!missingKeys.empty()) {
        std::string escapedHex;
        for (char c : hexStr) {
            if (c == '\n') escapedHex += "\\n";
            else if (c == '"') escapedHex += "\\\"";
            else escapedHex += c;
        }
        std::string json = "{\"hex\":\"" + escapedHex + "\",\"missing\":[";
        for (size_t i = 0; i < missingKeys.size(); i++) {
            if (i > 0) json += ",";
            json += "\"" + missingKeys[i] + "\"";
        }
        json += "]}";
        return json;
    }
    return hexStr;
}

EMSCRIPTEN_BINDINGS(dsl_to_hex_wasm) {
    emscripten::function("dslToHex", &dslToHex);
}
