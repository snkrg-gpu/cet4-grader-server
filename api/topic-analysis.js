// POST /api/topic-analysis - 调用豆包大模型分析作文题目
// 输入: { topic: "题目文本" }
// 输出: { ok: true, analysis: { translation, analysis, difficulty, approach, essence, essenceNote, technique, transfer, genre, genreReason } }
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
    const { topic } = req.body || {};
    if (!topic || !topic.trim()) {
      return res.status(200).json({ ok: false, error: 'EMPTY_TOPIC' });
    }
    const result = await analyzeTopic(topic.trim());
    return res.status(200).json({ ok: true, analysis: result });
  } catch (e) {
    console.error('topic-analysis error:', e && e.message, e && e.stack);
    return res.status(200).json({ ok: false, error: 'API_ERROR', detail: (e && e.message) || String(e) });
  }
};

async function analyzeTopic(topic) {
  const systemPrompt = [
    '你是一名英语写作老师，负责分析中国大学生 CET-4 作文题目。',
    '请对下面的作文题目进行全面分析，只输出 JSON，不要输出任何其他文字、解释或 markdown 代码块。',
    'JSON 格式如下：',
    '{',
    '  "translation": "题目的中文翻译",',
    '  "analysis": "对题目的详细分析（题目在考什么、核心要求是什么）",',
    '  "difficulty": "这道题的难点在哪里",',
    '  "approach": "针对难点的大致写作思路（分步骤）",',
    '  "essence": "把写作思路凝练成的8个字（中文，正好8个字）",',
    '  "essenceNote": "对8字思路的详细解析",',
    '  "technique": "写这篇作文需要的写作技巧",',
    '  "transfer": "举一反三：下次遇到类似题目应该怎么写（通用方法）",',
    '  "genre": "文体判断：议论文 或 应用文",',
    '  "genreReason": "判断文体的理由（根据题目关键词）"',
    '}',
    '',
    '规则：',
    '1. translation 是题目的中文翻译。',
    '2. analysis 用中文，2-3 句，说明题目核心要求。',
    '3. difficulty 用中文，1-2 句，指出最可能让考生失分的地方。',
    '4. approach 用中文，分点列出写作思路（如：1.开头引出 2.主体论证 3.结尾升华）。',
    '5. essence 必须是正好 8 个汉字，概括写作核心。格式参考："明立场，实论证，补辩证"（8个字，用逗号隔成几组，但总字数必须正好8）。绝不能是6个字、4个字或其他字数。',
    '6. essenceNote 用中文，1-2 句，解释这 8 个字怎么指导写作。',
    '7. technique 用中文，1-2 句，说明这篇作文用什么技巧（如举例、对比、三段式）。',
    '8. transfer 用中文，1-2 句，总结通用写法，下次遇到类似题能套用。',
    '9. genre 只能是"议论文"或"应用文"，根据题目关键词判断（如 should/how/what 议论文；letter/notice/application 应用文）。',
    '10. genreReason 用中文，说明判断依据。'
  ].join('\n');

  const userPrompt = '请分析下面这个作文题目：\n\n' + topic;

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
      max_tokens: 1500,
      thinking: { type: 'disabled' }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Doubao API ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const rawBody = await resp.text();
  let data = null;
  try { data = JSON.parse(rawBody); } catch (e) {
    throw new Error(`Doubao 返回非JSON响应: ${rawBody.slice(0, 300)}`);
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('Empty response from Doubao');

  let parsed = null;
  try { parsed = JSON.parse(content); } catch (e) {
    const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
    try { parsed = JSON.parse(cleaned); } catch (e2) {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) parsed = JSON.parse(cleaned.slice(start, end + 1));
      else throw new Error('无法解析 AI 返回的 JSON');
    }
  }

  return {
    translation: (parsed && parsed.translation || '').trim(),
    analysis: (parsed && parsed.analysis || '').trim(),
    difficulty: (parsed && parsed.difficulty || '').trim(),
    approach: (parsed && parsed.approach || '').trim(),
    essence: (parsed && parsed.essence || '').trim(),
    essenceNote: (parsed && parsed.essenceNote || '').trim(),
    technique: (parsed && parsed.technique || '').trim(),
    transfer: (parsed && parsed.transfer || '').trim(),
    genre: (parsed && parsed.genre || '').trim(),
    genreReason: (parsed && parsed.genreReason || '').trim()
  };
}
