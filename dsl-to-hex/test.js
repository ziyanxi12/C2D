'use strict';

// 用法：
//   node test.js                          # 使用内置 login DSL
//   node test.js path/to/your-dsl.json   # 使用自己的 DSL 文件

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT    = process.env.PORT || 3101;
const dslFile = process.argv[2]
  || path.join(__dirname, 'test-data/login-design-dsl.json');

const dsl = JSON.parse(fs.readFileSync(dslFile, 'utf8'));
const body = JSON.stringify({ dsl });

console.log(`DSL 文件: ${dslFile}`);
console.log(`发送到:   http://localhost:${PORT}/convert`);

const req = http.request({
  hostname: 'localhost',
  port:     PORT,
  path:     '/convert',
  method:   'POST',
  headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
}, res => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (result.error) {
      console.error('失败:', result.error);
      process.exit(1);
    }
    if (result.missing_keys?.length) {
      console.warn('缺失组件:', result.missing_keys);
    }
    const outPath = path.join(__dirname, 'test-output.zip');
    fs.writeFileSync(outPath, Buffer.from(result.zip, 'base64'));
    console.log(`\n成功！zip 已保存到: ${outPath}`);
    console.log(`可用 unzip -l ${outPath} 查看内容`);
  });
});

req.on('error', err => {
  if (err.code === 'ECONNREFUSED') {
    console.error(`连接被拒绝，服务没启动？先运行: node server.js`);
  } else {
    console.error('请求失败:', err.message);
  }
  process.exit(1);
});

req.write(body);
req.end();
