// POST /api/rewrite - 调用豆包大模型把用户作文润色成改进版
// 输入: { text: "作文全文" }
// 输出: { ok: true, en: "改进版英文", cn: "中文翻译" }
// 环境变量: DOUBAO_API_KEY, DOUBAO_ENDPOINT_ID

const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || '';
const DOUBAO_ENDPOINT_ID = process.env.DOUBAO_ENDPOINT_ID || '';
const DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

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

  if (!DOUBAO_API_KEY || !DOUBAO_ENDPOINT_ID) {
    return res.status(200).json({ ok: false, error: 'NOT_CONFIGURED' });
  }

  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(200).json({ ok: false, error: 'EMPTY_TEXT' });
    }

    const result = await rewriteEssay(text);
    return res.status(200).json({ ok: true, en: result.en, cn: result.cn });
  } catch (e) {
    console.error('rewrite error:', e && e.message, e && e.stack);
    return res.status(200).json({ ok: false, error: 'API_ERROR', detail: (e && e.message) || String(e) });
  }
};

// 调用豆包 API 润色作文
async function rewriteEssay(text) {
  const systemPrompt = [
    '你是一名英语写作老师，擅长把学生的英语作文润色成高分范文。',
    '请把下面这篇 CET-4 作文改写成改进版：修正所有语法错误、拼写错误、中式英语，升级简单词汇和句式，使表达更地道、更流畅，但保留原文的核心观点、段落结构和大致篇幅（120-180 词）。',
    '',
    '只输出改进后的英文作文全文，不要输出任何其他文字、解释、翻译或 markdown 代码块。',
    '不要新增原文没有的观点，只做语言层面的润色升级。'
  ].join('\n');

  const userPrompt = '请润色下面这篇作文：\n\n' + text;

  const resp = await fetch(`${DOUBAO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DOUBAO_API_KEY}`
    },
    body: JSON.stringify({
      model: DOUBAO_ENDPOINT_ID,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 800,
      thinking: { type: 'disabled' }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Doubao API ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const rawBody = await resp.text();
  let data = null;
  try {
    data = JSON.parse(rawBody);
  } catch (e) {
    throw new Error(`Doubao 返回非JSON响应: ${rawBody.slice(0, 300)}`);
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) {
    throw new Error('Empty response from Doubao');
  }

  // AI 直接返回润色后的英文全文（纯文本），去掉可能的多余包裹
  const en = content.replace(/```/g, '').trim();

  return {
    en: en,
    cn: ''
  };
}
