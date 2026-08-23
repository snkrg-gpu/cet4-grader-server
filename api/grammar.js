// POST /api/grammar - 调用豆包大模型做语法错误分析
// 输入: { text: "作文全文" }
// 输出: { ok: true, issues: [{ sentence, errText, msg, fix, sev }] }
// 环境变量: DOUBAO_API_KEY (ARK_API_KEY), DOUBAO_ENDPOINT_ID (ep-开头的推理接入点ID)

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

  // 未配置 API Key 时，返回降级提示（前端会回退到本地规则库）
  if (!DOUBAO_API_KEY || !DOUBAO_ENDPOINT_ID) {
    return res.status(200).json({ ok: false, error: 'NOT_CONFIGURED' });
  }

  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(200).json({ ok: false, error: 'EMPTY_TEXT', ver: 'v3', issues: [] });
    }

    const issues = await analyzeGrammar(text);
    return res.status(200).json({ ok: true, ver: 'v3', issues });
  } catch (e) {
    console.error('grammar error:', e && e.message, e && e.stack);
    return res.status(200).json({ ok: false, error: 'API_ERROR', ver: 'v3', detail: (e && e.message) || String(e), issues: [] });
  }
};

// 调用豆包 API 分析语法错误
async function analyzeGrammar(text) {
  const systemPrompt = [
    '你是一名英语语法批改老师，负责批改中国大学生的 CET-4 英语作文。',
    '请逐句检查作文中的语法错误、拼写错误、用词不当、中式英语、主谓一致、时态、单复数、冠词、介词、搭配等问题。',
    '',
    '只输出 JSON，不要输出任何其他文字、解释或 markdown 代码块。',
    'JSON 格式如下：',
    '{',
    '  "issues": [',
    '    {',
    '      "sentence": "有错误的完整原句",',
    '      "errText": "句子中错误的具体片段（用于红色高亮）",',
    '      "msg": "错误说明（中文，简短）",',
    '      "fix": "修改建议（中文，简短）",',
    '      "sev": "bad 或 warn"',
    '    }',
    '  ]',
    '}',
    '',
    '规则：',
    '1. sev 为 "bad" 表示严重错误（主谓不一致、时态混乱、句子成分残缺、严重拼写），"warn" 表示轻微错误（用词、冠词、介词、可优化的表达）。',
    '2. errText 必须是原句中真实存在的连续片段，不能自己编造。',
    '3. 如果没有发现任何错误，返回 { "issues": [] }。',
    '4. 每个错误单独一条，不要合并。'
  ].join('\n');

  const userPrompt = '请批改下面这篇作文，找出所有语法错误：\n\n' + text;

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
      temperature: 0.1,
      max_tokens: 2000
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

  // 解析 AI 返回的 JSON（可能带 markdown 代码块包裹，做容错）
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // 尝试去掉 markdown 代码块围栏
    const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch (e2) {
      // 尝试提取第一个 { ... } 块
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        parsed = JSON.parse(cleaned.slice(start, end + 1));
      } else {
        throw new Error('无法解析 AI 返回的 JSON');
      }
    }
  }

  const issues = (parsed && parsed.issues) || [];
  // 规范化每条 issue，确保字段齐全
  return issues.map(function (it) {
    return {
      sentence: (it.sentence || '').trim(),
      errText: (it.errText || '').trim(),
      msg: (it.msg || '').trim(),
      fix: (it.fix || '').trim(),
      sev: it.sev === 'bad' ? 'bad' : 'warn'
    };
  }).filter(function (it) {
    return it.sentence && it.msg;
  });
}
