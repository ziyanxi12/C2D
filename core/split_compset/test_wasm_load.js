const SplitCompset = require('./bin/split_compset.js');

SplitCompset().then(mod => {
    console.log('✓ WASM 模块加载成功');
    console.log('导出函数:', Object.keys(mod).filter(k => typeof mod[k] === 'function'));
    
    if (mod.splitCompset) {
        console.log('✓ splitCompset 函数存在');
        console.log('  参数数量:', mod.splitCompset.length);
    }
}).catch(err => {
    console.error('✗ 加载失败:', err.message);
});
