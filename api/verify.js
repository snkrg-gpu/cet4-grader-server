// POST /api/verify - 验证设备是否已激活（免登录检查）
const { verifyDevice } = require('./_lib');

module.exports = async function handler(req, res) {
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
    const { fingerprint } = req.body || {};
    const result = await verifyDevice(fingerprint);
    return res.status(200).json(result);
  } catch (e) {
    console.error('verify error:', e);
    return res.status(500).json({ ok: false, error: '服务器错误' });
  }
};
