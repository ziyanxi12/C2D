#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function generateStableId(component) {
  if (component.variants && component.variants.length > 0) {
    const variantNames = component.variants
      .map(v => v.name)
      .sort()
      .join('|');
    return `${component.name}::${component.canvasName}::${variantNames}`;
  }
  return `${component.name}::${component.canvasName}`;
}

function buildComponentSetIndex(componentSets) {
  const index = new Map();
  componentSets.forEach(cs => {
    const stableId = generateStableId(cs);
    index.set(stableId, cs);
  });
  return index;
}

function buildStandaloneComponentIndex(components) {
  const index = new Map();
  components.forEach(comp => {
    const stableId = generateStableId(comp);
    index.set(stableId, comp);
  });
  return index;
}

function buildVariantMap(variants) {
  const map = new Map();
  variants.forEach(v => {
    map.set(v.name, v);
  });
  return map;
}

function diffComponentIndexes(oldJsonPath, newJsonPath, outputPath) {
  console.log('读取 JSON 文件...');
  console.log(`  旧版本: ${oldJsonPath}`);
  console.log(`  新版本: ${newJsonPath}`);

  const oldData = JSON.parse(fs.readFileSync(oldJsonPath, 'utf-8'));
  const newData = JSON.parse(fs.readFileSync(newJsonPath, 'utf-8'));

  const mapping = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    oldFile: path.basename(oldJsonPath),
    newFile: path.basename(newJsonPath),
    componentSetMappings: {},
    variantMappings: {},
    standaloneComponentMappings: {},
    unmatched: {
      componentSets: { oldOnly: [], newOnly: [] },
      variants: { oldOnly: [], newOnly: [] },
      standaloneComponents: { oldOnly: [], newOnly: [] }
    }
  };

  // 处理组件集
  console.log('\n处理组件集...');
  const oldComponentSets = buildComponentSetIndex(oldData.componentSets || []);
  const newComponentSets = buildComponentSetIndex(newData.componentSets || []);

  let matchedComponentSets = 0;
  let totalVariants = 0;

  newComponentSets.forEach((newCs, stableId) => {
    const oldCs = oldComponentSets.get(stableId);
    if (oldCs) {
      matchedComponentSets++;
      mapping.componentSetMappings[oldCs.componentKey] = newCs.componentKey;

      const oldVariants = buildVariantMap(oldCs.variants || []);
      const newVariants = buildVariantMap(newCs.variants || []);

      newVariants.forEach((newVariant, name) => {
        const oldVariant = oldVariants.get(name);
        if (oldVariant) {
          totalVariants++;
          mapping.variantMappings[oldVariant.componentKey] = newVariant.componentKey;
        } else {
          mapping.unmatched.variants.newOnly.push({
            componentKey: newCs.componentKey,
            variantKey: newVariant.componentKey,
            name: newVariant.name
          });
        }
      });

      oldVariants.forEach((oldVariant, name) => {
        if (!newVariants.has(name)) {
          mapping.unmatched.variants.oldOnly.push({
            componentKey: oldCs.componentKey,
            variantKey: oldVariant.componentKey,
            name: oldVariant.name
          });
        }
      });
    } else {
      mapping.unmatched.componentSets.newOnly.push({
        componentKey: newCs.componentKey,
        name: newCs.name
      });
    }
  });

  oldComponentSets.forEach((oldCs, stableId) => {
    if (!newComponentSets.has(stableId)) {
      mapping.unmatched.componentSets.oldOnly.push({
        componentKey: oldCs.componentKey,
        name: oldCs.name
      });
    }
  });

  console.log(`  ✓ 匹配组件集: ${matchedComponentSets}/${newComponentSets.size}`);
  console.log(`  ✓ 匹配变体: ${totalVariants}`);

  // 处理独立组件
  console.log('\n处理独立组件...');
  const oldStandalone = buildStandaloneComponentIndex(oldData.standaloneComponents || []);
  const newStandalone = buildStandaloneComponentIndex(newData.standaloneComponents || []);

  let matchedStandalone = 0;

  newStandalone.forEach((newComp, stableId) => {
    const oldComp = oldStandalone.get(stableId);
    if (oldComp) {
      matchedStandalone++;
      mapping.standaloneComponentMappings[oldComp.componentKey] = newComp.componentKey;
    } else {
      mapping.unmatched.standaloneComponents.newOnly.push({
        componentKey: newComp.componentKey,
        name: newComp.name
      });
    }
  });

  oldStandalone.forEach((oldComp, stableId) => {
    if (!newStandalone.has(stableId)) {
      mapping.unmatched.standaloneComponents.oldOnly.push({
        componentKey: oldComp.componentKey,
        name: oldComp.name
      });
    }
  });

  console.log(`  ✓ 匹配独立组件: ${matchedStandalone}/${newStandalone.size}`);

  // 统计
  console.log('\n统计信息:');
  console.log(`  组件集映射: ${Object.keys(mapping.componentSetMappings).length} 条`);
  console.log(`  变体映射: ${Object.keys(mapping.variantMappings).length} 条`);
  console.log(`  独立组件映射: ${Object.keys(mapping.standaloneComponentMappings).length} 条`);
  
  const unmatchedOld = mapping.unmatched.componentSets.oldOnly.length + 
                        mapping.unmatched.standaloneComponents.oldOnly.length;
  const unmatchedNew = mapping.unmatched.componentSets.newOnly.length + 
                        mapping.unmatched.standaloneComponents.newOnly.length;
  
  if (unmatchedOld > 0) {
    console.log(`  ⚠️  仅旧版本存在的组件: ${unmatchedOld} 个`);
  }
  if (unmatchedNew > 0) {
    console.log(`  ⚠️  仅新版本存在的组件: ${unmatchedNew} 个`);
  }

  // 写入文件
  fs.writeFileSync(outputPath, JSON.stringify(mapping, null, 2), 'utf-8');
  console.log(`\n✓ 生成映射表: ${outputPath}`);

  return mapping;
}

function printUsage() {
  console.log(`
用法: node diff_component_index.js <old_json> <new_json> <output_json>

参数:
  old_json     旧版本 component_index.json 文件路径
  new_json     新版本 component_index.json 文件路径
  output_json  输出的映射表 JSON 文件路径

示例:
  node diff_component_index.js \\
    output/v1/component_index.json \\
    output/v2/component_index.json \\
    output/mapping.json
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    printUsage();
    process.exit(1);
  }

  const [oldJsonPath, newJsonPath, outputPath] = args;

  if (!fs.existsSync(oldJsonPath)) {
    console.error(`错误: 文件不存在: ${oldJsonPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(newJsonPath)) {
    console.error(`错误: 文件不存在: ${newJsonPath}`);
    process.exit(1);
  }

  diffComponentIndexes(oldJsonPath, newJsonPath, outputPath);
}

if (require.main === module) {
  main();
}

module.exports = { diffComponentIndexes, generateStableId };