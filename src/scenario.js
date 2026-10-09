// A scenario file is a System One request body: { state, questions: { id: question } }.
// The editor form keeps rows as arrays, so that ids and keys can be typed freely:
//   { state, questions: [{ id, type, instructions, criteria }] }
//   state: a text, or items [{ key, value }]
//   criteria: choice [{ key, description }], score [description], noul { true, false }
// checkRequest() lists what of a request the editor cannot hold; validate() lists what of a form a request cannot hold.

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

const CHOICE_OPTIONS = { min: 2, max: 20 }; // the Julia-1 encoder takes 2 to 20 options
const SCORE_LEVELS = { min: 2, max: 10 };

// what keeps a request from being held by the editor as it is: the state is a string or a flat object of strings,
// instructions and criteria are strings. Returns messages in the style of systemone.js ("questions.<id>: ..."),
// empty when the request can be held. fromRequest() turns such values into JSON text instead.
export function checkRequest(request) {
  if (!isObject(request)) return ['must be an object: {"state": ..., "questions": {...}}'];
  const errors = [];
  for (const key of Object.keys(request)) {
    if (!['state', 'questions', 'model'].includes(key)) errors.push(`${key}: unknown field; a request has "state" and "questions"`);
  }

  const { state, questions } = request;
  if (isObject(state)) {
    for (const [key, value] of Object.entries(state)) {
      if (key === '') errors.push('state: a field name is empty');
      else if (typeof value !== 'string') errors.push(`state.${key}: must be a string`);
    }
  } else if (typeof state !== 'string') {
    errors.push('state: must be a string, or a flat object whose values are strings');
  }

  if (!isObject(questions) || !Object.keys(questions).length) {
    errors.push('questions: must be an object with at least one question');
    return errors;
  }
  for (const [id, q] of Object.entries(questions)) {
    const problem = message => errors.push(`questions.${id}: ${message}`);
    if (id === '') problem('the question id is empty');
    if (!isObject(q)) {
      problem('must be an object');
      continue;
    }
    for (const key of Object.keys(q)) {
      if (!['type', 'instructions', 'criteria'].includes(key)) problem(`unknown field "${key}"`);
    }
    if (!TYPES.includes(q.type)) problem('"type" must be one of: choice, score, noul');
    if (typeof q.instructions !== 'string' || !q.instructions.trim()) problem('"instructions" must be a non-empty string');

    const criteria = q.criteria;
    if (q.type === 'choice') {
      const options = isObject(criteria) ? Object.entries(criteria) : [];
      if (options.length < CHOICE_OPTIONS.min || options.length > CHOICE_OPTIONS.max) {
        problem(`"criteria" must be an object of ${CHOICE_OPTIONS.min} to ${CHOICE_OPTIONS.max} options`);
      }
      for (const [key, description] of options) {
        if (key === '') problem('an option key is empty');
        else if (description !== null && typeof description !== 'string') problem(`criteria.${key} must be a string or null`);
      }
    } else if (q.type === 'score') {
      if (!Array.isArray(criteria) || criteria.length < SCORE_LEVELS.min || criteria.length > SCORE_LEVELS.max) {
        problem(`"criteria" must be an array of ${SCORE_LEVELS.min} to ${SCORE_LEVELS.max} levels`);
      } else {
        criteria.forEach((level, i) => { if (typeof level !== 'string') problem(`criteria[${i}] must be a string`); });
      }
    } else if (q.type === 'noul' && criteria !== undefined) {
      if (!isObject(criteria)) {
        problem('"criteria" must be an object with "true" and "false" descriptions, or be left out');
      } else {
        for (const [key, description] of Object.entries(criteria)) {
          if (key !== 'true' && key !== 'false') problem(`unknown criteria key "${key}"; use "true" and "false"`);
          else if (typeof description !== 'string') problem(`criteria.${key} must be a string`);
        }
      }
    }
  }
  return errors;
}

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
