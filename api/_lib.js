// 设备指纹生成（前端调用，后端只存储和比对）
// 指纹由前端计算后传给后端，后端不做计算，只存字符串比对

// 激活码状态存储结构（KV）:
//   key: code:<激活码>  -> JSON { status: "unused" | "used", fingerprint: "<指纹>", activatedAt: <时间戳> }
//   key: device:<指纹>  -> JSON { code: "<激活码>", lastSeen: <时间戳> }

const { kv } = require('@vercel/kv');

// 校验激活码并绑定设备
// 输入: { code, fingerprint }
// 输出: { ok: true } 或 { ok: false, error: "..." }
async function activateCode(code, fingerprint) {
  if (!code || !fingerprint) {
    return { ok: false, error: '缺少激活码或设备信息' };
  }

  const key = `code:${code}`;
  const existing = await kv.get(key);

  if (!existing) {
    return { ok: false, error: '激活码无效' };
  }

  if (existing.status === 'used') {
    // 已使用：检查是否是同一设备
    if (existing.fingerprint === fingerprint) {
      // 同一设备，放行（平衡模式：同设备多次登录）
      await kv.set(`device:${fingerprint}`, { code, lastSeen: Date.now() });
      return { ok: true, reused: true };
    }
    return { ok: false, error: '该激活码已在其他设备使用' };
  }

  // 未使用：首次激活，绑定设备
  await kv.set(key, {
    status: 'used',
    fingerprint,
    activatedAt: Date.now()
  });
  await kv.set(`device:${fingerprint}`, { code, lastSeen: Date.now() });
  return { ok: true, activated: true };
}

// 验证设备是否已激活（用于后续免登录）
// 输入: { fingerprint }
// 输出: { ok: true } 或 { ok: false }
async function verifyDevice(fingerprint) {
  if (!fingerprint) {
    return { ok: false };
  }
  const device = await kv.get(`device:${fingerprint}`);
  if (device && device.code) {
    await kv.set(`device:${fingerprint}`, { code: device.code, lastSeen: Date.now() });
    return { ok: true };
  }
  return { ok: false };
}

module.exports = { activateCode, verifyDevice, kv };
