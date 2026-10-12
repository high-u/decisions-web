// TypeSafe System One (Jev) compatible layer over JuliaCPU.
// Mirrors llama.cpp tools/server/server-decision.cpp for Julia-1 (decision type LAYA, temperature 1).

const TYPES = ['choice', 'score', 'noul'];

// Same as the "tojson" filter of llama.cpp: keys in insertion order, ", " and ": " separators, non-ASCII kept.
function toJSONText(value) {
  if (Array.isArray(value)) return `[${value.map(toJSONText).join(', ')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${toJSONText(item)}`).join(', ')}}`;
  return JSON.stringify(value) ?? 'null';
}

export const toText = value => typeof value === 'string' ? value : toJSONText(value);

// Julia template: an option is shown as its description if it has one, as its key otherwise.
// Falsy like Jinja: null, "", [] and {} fall back to the key.
function isEmpty(value) {
  if (value === null || value === undefined || value === '' || value === false || value === 0) return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'object' && Object.keys(value).length === 0;
}

const optionText = ({ key, description }) => isEmpty(description) ? key : toText(description);

function parseQuestions(body) {
  if (body?.state === undefined || body.state === null) throw new TypeError('"state" must be provided');
  const questions = body.questions;
  if (!questions || typeof questions !== 'object' || Array.isArray(questions) || !Object.keys(questions).length)
    throw new TypeError('"questions" must be a non-empty object');

  return Object.entries(questions).map(([id, q]) => {
    const fail = message => new TypeError(`questions.${id}: ${message}`);
    if (!q || typeof q !== 'object' || Array.isArray(q)) throw fail('must be an object');
    if (q.instructions === undefined || q.instructions === null) throw fail('"instructions" must be provided');
    if (!TYPES.includes(q.type)) throw fail('"type" must be one of: choice, score, noul');

    const criteria = q.criteria ?? null;
    let options;
    if (q.type === 'choice') {
      if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria) || !Object.keys(criteria).length)
        throw fail('"criteria" must be a non-empty object');
      options = Object.entries(criteria).map(([key, description]) => ({ key, description }));
    } else if (q.type === 'score') {
      if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 10)
        throw fail('"criteria" must be an array of 2 to 10 levels');
      options = criteria.map((description, i) => ({ key: String(i), description }));
    } else {
      if (criteria !== null && (typeof criteria !== 'object' || Array.isArray(criteria)))
        throw fail('"criteria" must be an object');
      options = ['false', 'true'].map(key => ({ key, description: criteria?.[key] ?? null }));
    }
    return { id, type: q.type, instructions: q.instructions, options };
  });
}

function softmax(logits) {
  const peak = Math.max(...logits);
  const weights = logits.map(x => Math.exp(x - peak));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map(x => x / total);
}

// confidence formulas published by TypeSafe, as in llama.cpp
function confidenceChoice(probs) {
  if (probs.length < 2) return 1;
  const uniform = 1 / probs.length;
  return Math.max(0, (Math.max(...probs) - uniform) / (1 - uniform));
}

function confidenceScore(probs) {
  const n = probs.length;
  if (n < 2) return 1;
  const mode = probs.indexOf(Math.max(...probs));
  let dist = 0, distUniform = 0;
  for (let i = 0; i < n; i++) {
    dist += probs[i] * Math.abs(i - mode);
    distUniform += Math.abs(i - (n - 1) / 2) / n;
  }
  return Math.max(0, 1 - dist / distUniform);
}

function formatAnswer(question, logits) {
  const probs = softmax(logits);
  const { type, options } = question;
  if (type === 'noul') return { type, noul: probs[options.findIndex(o => o.key === 'true')] };

  const probabilities = Object.fromEntries(options.map((o, i) => [o.key, probs[i]]));
  if (type === 'choice') {
    const best = probs.indexOf(Math.max(...probs));
    return { type, choice: options[best].key, probabilities, confidence: confidenceChoice(probs) };
  }
  return {
    type,
    score: probs.reduce((sum, p, i) => sum + i * p, 0),
    legend: Object.fromEntries(options.map(o => [o.key, o.description])),
    probabilities,
    confidence: confidenceScore(probs),
  };
}

// body: { state, questions: { id: { type, instructions, criteria } } } as in POST /v1/systemone
export async function systemone(engine, body) {
  const questions = parseQuestions(body);
  const state = toText(body.state);
  const rows = questions.map(q => ({
    state,
    question: toText(q.instructions),
    type: q.type,
    options: q.options.map(optionText),
  }));
  const logits = await engine.logits(rows);
  const encoded = rows.map(row =>
    JSON.parse(engine.encoder.encode(JSON.stringify(row), engine.maxLength, engine.headLength, engine.strictEncoding)));
  return {
    model: 'julia-1',
    answers: Object.fromEntries(questions.map((q, i) => [q.id, formatAnswer(q, logits[i])])),
    usage: { input_tokens: encoded.reduce((sum, x) => sum + x.ids.length, 0), output_tokens: 0 },
  };
}
