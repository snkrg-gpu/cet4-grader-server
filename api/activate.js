// POST /api/activate - 激活码校验 + 设备绑定
const { activateCode } = require('./_lib');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { code, fingerprint } = req.body || {};
    const result = await activateCode(code, fingerprint);
    return res.status(200).json(result);
  } catch (e) {
    console.error('activate error:', e);
    return res.status(500).json({ ok: false, error: '服务器错误' });
  }
};
