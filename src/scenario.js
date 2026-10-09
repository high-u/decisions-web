// A scenario file is a System One request body: { state, questions: { id: question } }.
// The editor form keeps rows as arrays, so that ids and keys can be typed freely:
//   { state, questions: [{ id, type, instructions, criteria }] }
//   state: a text, or items [{ key, value }]
//   criteria: choice [{ key, description }], score [description], noul { true, false }
// validate() lists what a request cannot hold.

export const TYPES = ['choice', 'score', 'noul'];

export function defaultCriteria(type) {
  if (type === 'choice') return [{ key: '', description: '' }, { key: '', description: '' }, { key: '', description: '' }];
  if (type === 'score') return ['', '', ''];
  return { true: '', false: '' };
}

export const newQuestion = id => ({ id, type: 'choice', instructions: '', criteria: defaultCriteria('choice') });

export const emptyForm = () => ({ state: '', questions: [newQuestion('q1')] });

const asText = v => typeof v === 'string' ? v : JSON.stringify(v);

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// request -> editor form; throws on what the editor cannot show
export function fromRequest(request) {
  if (!isObject(request)) throw new TypeError('not a JSON object');
  const state = request.state ?? '';
  if (typeof state !== 'string' && !isObject(state)) throw new TypeError('"state" must be a string or an object');
  if (request.questions !== undefined && !isObject(request.questions)) throw new TypeError('"questions" must be an object');
  return {
    state: typeof state === 'string' ? state : Object.entries(state).map(([key, value]) => ({ key, value: asText(value) })),
    questions: Object.entries(request.questions ?? {}).map(([id, q]) => ({
      id,
      type: TYPES.includes(q?.type) ? q.type : 'choice',
      instructions: asText(q?.instructions ?? ''),
      criteria: q?.type === 'score' ? (Array.isArray(q.criteria) ? q.criteria.map(asText) : defaultCriteria('score'))
        : q?.type === 'noul' ? { true: asText(q.criteria?.true ?? ''), false: asText(q.criteria?.false ?? '') }
        : Object.entries(isObject(q?.criteria) ? q.criteria : {}).map(([key, description]) => ({ key, description: asText(description ?? '') })),
    })),
  };
}

// editor form -> request
export function toRequest(form) {
  const questions = {};
  for (const q of form.questions) {
    let criteria;
    if (q.type === 'choice') criteria = Object.fromEntries(q.criteria.map(r => [r.key, r.description || null]));
    else if (q.type === 'score') criteria = q.criteria;
    else {
      const entries = Object.entries(q.criteria).filter(([, d]) => d);
      if (entries.length) criteria = Object.fromEntries(entries);
    }
    questions[q.id] = { type: q.type, instructions: q.instructions, ...(criteria ? { criteria } : {}) };
  }
  const state = typeof form.state === 'string' ? form.state : Object.fromEntries(form.state.map(r => [r.key, r.value]));
  return { state, questions };
}

// what a request cannot hold: empty or repeated keys, and an order that JSON objects would change
// (keys made of digits only are always put first, in numeric order).
// Returns { path: { code, label, key } }, path being "state.<i>", "q.<i>" or "q.<i>.c.<j>".
export function validate(form) {
  const errors = {};
  const checkKeys = (keys, pathOf, label) => {
    keys.forEach((key, i) => {
      if (key === '') errors[pathOf(i)] = { code: 'err.empty', label };
      else if (keys.indexOf(key) !== i) errors[pathOf(i)] = { code: 'err.duplicate', label, key };
    });
    const unique = [...new Set(keys)];
    const order = Object.keys(Object.fromEntries(unique.map(k => [k, 0])));
    const moved = keys.findIndex(key => /^(0|[1-9]\d*)$/.test(key) && order.indexOf(key) !== unique.indexOf(key));
    if (moved >= 0) errors[pathOf(moved)] = { code: 'err.numeric', label };
  };
  if (typeof form.state !== 'string') checkKeys(form.state.map(r => r.key), i => `state.${i}`, 'label.item');
  checkKeys(form.questions.map(q => q.id), i => `q.${i}`, 'label.id');
  form.questions.forEach((q, qi) => {
    if (q.type === 'choice') checkKeys(q.criteria.map(r => r.key), i => `q.${qi}.c.${i}`, 'label.key');
  });
  return errors;
}

// the text of a scenario file
export const toFileText = form => JSON.stringify(toRequest(form), null, 2) + '\n';
