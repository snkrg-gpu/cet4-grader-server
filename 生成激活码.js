// 生成一批激活码（本地运行）
// 用法: node 生成激活码.js [数量]
// 输出: 生成 N 个激活码，打印到屏幕，并保存到 激活码.txt

const crypto = require('crypto');
const fs = require('fs');

const count = parseInt(process.argv[2]) || 50;

function genCode() {
  // 8位，去掉易混淆字符
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.randomBytes(count * 8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  // 格式: XXXX-XXXX
  return code.slice(0, 4) + '-' + code.slice(4, 8);
}

const codes = [];
const used = new Set();
while (codes.length < count) {
  const c = genCode();
  if (!used.has(c)) {
    used.add(c);
    codes.push(c);
  }
}

console.log(`生成 ${count} 个激活码：`);
console.log('');
codes.forEach((c, i) => console.log(`${String(i + 1).padStart(3)}. ${c}`));

// 保存到文件
fs.writeFileSync('激活码.txt', codes.join('\n'), 'utf8');
console.log('');
console.log(`已保存到 激活码.txt`);

// 同时输出 JSON 格式（方便导入数据库）
const json = codes.map(c => ({ code: c, status: 'unused' }));
fs.writeFileSync('激活码.json', JSON.stringify(json, null, 2), 'utf8');
console.log(`已保存到 激活码.json（用于导入数据库）`);
