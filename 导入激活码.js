// 导入激活码到 Vercel KV（部署后运行）
// 用法: 
//   1. 先设置环境变量 KV_REST_API_URL 和 KV_REST_API_TOKEN
//   2. node 导入激活码.js
// 读取 激活码.txt，批量写入 KV

const { kv } = require('@vercel/kv');
const fs = require('fs');

async function main() {
  const codes = fs.readFileSync('激活码.txt', 'utf8').split('\n').filter(c => c.trim());
  console.log(`读取到 ${codes.length} 个激活码，开始导入...`);

  let ok = 0;
  for (const code of codes) {
    const key = `code:${code.trim()}`;
    const existing = await kv.get(key);
    if (!existing) {
      await kv.set(key, { status: 'unused' });
      ok++;
    }
  }

  console.log(`导入完成：新增 ${ok} 个，跳过 ${codes.length - ok} 个（已存在）`);
  process.exit(0);
}

main().catch(e => {
  console.error('导入失败:', e.message);
  console.error('请确认已设置 KV_REST_API_URL 和 KV_REST_API_TOKEN 环境变量');
  process.exit(1);
});
