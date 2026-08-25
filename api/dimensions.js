// POST /api/dimensions - 调用豆包大模型分析五维度扣分原因与优化建议
// 输入: { text: "作文全文", topic: "题目", dims: { topicScore, structScore, sentScore, logicScore, overallScore } }
// 输出: { ok: true, dims: { topic: {deduct, reason, advice}, struct: {...}, sent: {...}, logic: {...}, overall: {...} } }
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
    const { text, topic, dims } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(200).json({ ok: false, error: 'EMPTY_TEXT' });
    }
    const result = await analyzeDimensions(text, topic, dims);
    return res.status(200).json({ ok: true, dims: result });
  } catch (e) {
    console.error('dimensions error:', e && e.message, e && e.stack);
    return res.status(200).json({ ok: false, error: 'API_ERROR', detail: (e && e.message) || String(e) });
  }
};

async function analyzeDimensions(text, topic, dims) {
  const dimNames = {
    topic: '审题',
    struct: '文章结构',
    sent: '句式表达',
    logic: '内容逻辑',
    overall: '整体连贯'
  };
  const scores = {
    topic: (dims && dims.topicScore) != null ? dims.topicScore : 0,
    struct: (dims && dims.structScore) != null ? dims.structScore : 0,
    sent: (dims && dims.sentScore) != null ? dims.sentScore : 0,
    logic: (dims && dims.logicScore) != null ? dims.logicScore : 0,
    overall: (dims && dims.overallScore) != null ? dims.overallScore : 0
  };

  const systemPrompt = [
    '你是一名英语写作老师，负责分析中国大学生 CET-4 作文在五个维度的表现。',
    '每个维度满分 15 分，请指出该维度扣了多少分、为什么扣分、以及如何优化才能拿回这些分。',
    '只输出 JSON，不要输出任何其他文字、解释或 markdown 代码块。',
    'JSON 格式如下：',
    '{',
    '  "dims": {',
    '    "topic": { "deduct": 2, "reason": "扣分原因", "advice": "优化建议" },',
    '    "struct": { "deduct": 2, "reason": "扣分原因", "advice": "优化建议" },',
    '    "sent": { "deduct": 2, "reason": "扣分原因", "advice": "优化建议" },',
    '    "logic": { "deduct": 2, "reason": "扣分原因", "advice": "优化建议" },',
    '    "overall": { "deduct": 2, "reason": "扣分原因", "advice": "优化建议" }',
    '  }',
    '}',
    '',
    '规则：',
    '1. deduct 是该维度扣掉的分数（15 - 得分），必须与给出的得分一致。',
    '2. reason 用中文，简短说明为什么扣分（1-2 句）。',
    '3. advice 用中文，给出具体可操作的优化建议（1-2 句），要针对这篇作文的实际内容。',
    '4. 如果某维度满分（15 分），deduct 为 0，reason 和 advice 写"表现优秀"或具体优点。',
    '5. 所有说明都基于作文实际内容，不要套话。'
  ].join('\n');

  const userPrompt = '题目：' + (topic || '未选择题目') + '\n\n各维度得分（满分15）：\n' +
    '审题 ' + scores.topic + '/15\n文章结构 ' + scores.struct + '/15\n句式表达 ' + scores.sent + '/15\n内容逻辑 ' + scores.logic + '/15\n整体连贯 ' + scores.overall + '/15\n\n' +
    '作文全文：\n' + text;

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
      max_tokens: 1200,
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

  const dimsResult = (parsed && parsed.dims) || {};
  // 规范化：确保每个维度字段齐全
  const result = {};
  ['topic', 'struct', 'sent', 'logic', 'overall'].forEach(function(key){
    const d = dimsResult[key] || {};
    result[key] = {
      deduct: typeof d.deduct === 'number' ? d.deduct : 0,
      reason: (d.reason || '').trim(),
      advice: (d.advice || '').trim()
    };
  });
  return result;
}
