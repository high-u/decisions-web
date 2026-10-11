// A scenario file is a System One request body: { model, state, questions: { id: question } }.
// The editor form keeps rows as arrays, so that ids and keys can be typed freely:
//   { model, state, questions: [{ id, type, instructions, criteria }] }
//   model: kept as it came (null when a file has none), APP_MODEL for scenarios made in this app; not used to run
//   state: a text, or items [{ key, value }]
//   criteria: choice [{ key, description }], score [description], noul { true, false }
// Every way in goes through the same checks:
//   a request (an opened file, a WebMCP tool): checkRequest(), then fromRequest(), then validate()
//   the form (save, run): validate(), then toRequest()
// Errors are { path, at, code, params }: code and params make the message (see messages.js), at is where it is in the
// request ("questions.route.criteria"), path is the row of the form it is shown under (validate() only).

export const TYPES = ['choice', 'score', 'noul'];

// the model a scenario made in this app is for
export const APP_MODEL = 'SupersonicLabs/Julia-1';

// how many rows a question can have: the Julia-1 encoder takes 2 to 20 options, the API 2 to 10 score levels
export const LIMITS = { choice: { min: 2, max: 20 }, score: { min: 2, max: 10 } };

export function defaultCriteria(type) {
  if (type === 'choice') return [{ key: '', description: '' }, { key: '', description: '' }, { key: '', description: '' }];
  if (type === 'score') return ['', '', ''];
  return { true: '', false: '' };
}

export const newQuestion = id => ({ id, type: 'choice', instructions: '', criteria: defaultCriteria('choice') });

export const emptyForm = () => ({ model: APP_MODEL, state: '', questions: [newQuestion('q1')] });

// whether one more row can be added to the criteria of a question
export const canAddCriterion = q => q.type !== 'noul' && q.criteria.length < LIMITS[q.type].max;

const asText = v => typeof v === 'string' ? v : JSON.stringify(v);

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// what the editor cannot hold. nested: objects and arrays where the API takes them (state values, instructions,
// descriptions) are accepted, and fromRequest() turns them into JSON text; without it, only strings are.
export function checkRequest(request, { nested = true } = {}) {
  if (!isObject(request)) return [{ at: '', code: 'err.notObject' }];
  const errors = [];
  const problem = (at, code, params) => errors.push({ at, code, params });
  // a value the API takes as text, or as JSON when nested
  const isText = v => typeof v === 'string' || (nested && v !== null && typeof v === 'object');
  const notText = nested ? 'err.notText' : 'err.notString';

  for (const key of Object.keys(request)) {
    if (!['model', 'state', 'questions'].includes(key)) problem(key, 'err.unknownField', { field: key });
  }
  if (request.model !== undefined && typeof request.model !== 'string') problem('model', 'err.notString');

  const { state, questions } = request;
  if (state === undefined) problem('state', 'err.missing');
  else if (isObject(state)) {
    for (const [key, value] of Object.entries(state)) {
      // nested: any JSON value is turned into text
      if (!nested && typeof value !== 'string') problem(`state.${key}`, 'err.notString');
    }
  } else if (typeof state !== 'string') problem('state', nested ? 'err.stateType' : 'err.stateFlat');

  if (questions === undefined) return problem('questions', 'err.missing'), errors;
  if (!isObject(questions)) return problem('questions', 'err.notObject'), errors;
  for (const [id, q] of Object.entries(questions)) {
    const at = `questions.${id}`;
    if (!isObject(q)) {
      problem(at, 'err.notObject');
      continue;
    }
    for (const key of Object.keys(q)) {
      if (!['type', 'instructions', 'criteria'].includes(key)) problem(`${at}.${key}`, 'err.unknownField', { field: key });
    }
    if (q.type === undefined) problem(`${at}.type`, 'err.missing');
    else if (!TYPES.includes(q.type)) problem(`${at}.type`, 'err.type', { types: TYPES.join(', ') });
    if (q.instructions === undefined) problem(`${at}.instructions`, 'err.missing');
    else if (!isText(q.instructions)) problem(`${at}.instructions`, notText);

    const { criteria } = q;
    if (q.type === 'choice') {
      if (criteria === undefined) problem(`${at}.criteria`, 'err.missing');
      else if (!isObject(criteria)) problem(`${at}.criteria`, 'err.choiceCriteria');
      else {
        for (const [key, description] of Object.entries(criteria)) {
          if (description !== null && !isText(description)) problem(`${at}.criteria.${key}`, `${notText}OrNull`);
        }
      }
    } else if (q.type === 'score') {
      if (criteria === undefined) problem(`${at}.criteria`, 'err.missing');
      else if (!Array.isArray(criteria)) problem(`${at}.criteria`, 'err.scoreCriteria');
      else criteria.forEach((level, i) => { if (!isText(level)) problem(`${at}.criteria[${i}]`, notText); });
    } else if (q.type === 'noul' && criteria !== undefined) {
      if (!isObject(criteria)) problem(`${at}.criteria`, 'err.noulCriteria');
      else {
        for (const [key, description] of Object.entries(criteria)) {
          if (key !== 'true' && key !== 'false') problem(`${at}.criteria.${key}`, 'err.noulKey');
          else if (!isText(description)) problem(`${at}.criteria.${key}`, notText);
        }
      }
    }
  }
  return errors;
}

// request -> editor form, for a request that checkRequest() found no errors in
export function fromRequest(request) {
  const { state } = request;
  return {
    model: request.model ?? null,
    state: typeof state === 'string' ? state : Object.entries(state).map(([key, value]) => ({ key, value: asText(value) })),
    questions: Object.entries(request.questions).map(([id, q]) => ({
      id,
      type: q.type,
      instructions: asText(q.instructions),
      criteria: q.type === 'choice' ? Object.entries(q.criteria).map(([key, description]) => ({ key, description: description === null ? '' : asText(description) }))
        : q.type === 'score' ? q.criteria.map(asText)
        : { true: asText(q.criteria?.true ?? ''), false: asText(q.criteria?.false ?? '') },
    })),
  };
}

// editor form -> request, for a form that validate() found no errors in
// (repeated keys would be merged into one, as a JSON object holds a key once)
export function toRequest(form) {
  const questions = {};
  for (const q of form.questions) {
    let criteria;
    if (q.type === 'choice') criteria = Object.fromEntries(q.criteria.map(r => [r.key, r.description]));
    else if (q.type === 'score') criteria = q.criteria;
    else {
      const entries = Object.entries(q.criteria).filter(([, d]) => d);
      if (entries.length) criteria = Object.fromEntries(entries);
    }
    questions[q.id] = { type: q.type, instructions: q.instructions, ...(criteria ? { criteria } : {}) };
  }
  const state = typeof form.state === 'string' ? form.state : Object.fromEntries(form.state.map(r => [r.key, r.value]));
  return { ...(form.model !== null ? { model: form.model } : {}), state, questions };
}

const isBlank = text => !text.trim();

// a key that JavaScript objects put first, in numeric order: an integer from 0 to 2^32 - 2 written without leading zeros
const isIndexKey = key => /^(0|[1-9]\d*)$/.test(key) && Number(key) < 2 ** 32 - 1;

// what of a form a request cannot hold or the model cannot run: nothing to ask or evaluate, empty or repeated keys,
// an order that JSON objects would change (keys made of digits only are always put first, in numeric order),
// and more or fewer rows than a question can have. One error per row at most, the first found.
// path: "state", "state.<i>", "questions", "q.<i>", "q.<i>.instructions", "q.<i>.criteria" or "q.<i>.c.<j>"
export function validate(form) {
  const errors = [];
  const problem = (path, at, code, params) => {
    if (!errors.some(e => e.path === path)) errors.push({ path, at, code, params });
  };
  // ats: where each key is in the request; a key that is empty or repeated has no place of its own there
  const checkKeys = (keys, pathOf, atOf, label) => {
    keys.forEach((key, i) => {
      if (key === '') problem(pathOf(i), atOf(i), 'err.empty', { label });
      else if (keys.indexOf(key) !== i) problem(pathOf(i), atOf(i), 'err.duplicate', { label, key });
    });
    const unique = [...new Set(keys)];
    const order = Object.keys(Object.fromEntries(unique.map(k => [k, 0])));
    const moved = keys.findIndex(key => isIndexKey(key) && order.indexOf(key) !== unique.indexOf(key));
    if (moved >= 0) problem(pathOf(moved), atOf(moved), 'err.numeric', { label, key: keys[moved] });
  };

  if (typeof form.state === 'string') {
    if (isBlank(form.state)) problem('state', 'state', 'err.noState');
  } else {
    checkKeys(form.state.map(r => r.key), i => `state.${i}`, i => `state[${i}]`, 'label.item');
    if (form.state.every(r => isBlank(r.value))) problem('state', 'state', 'err.noState');
  }

  if (!form.questions.length) problem('questions', 'questions', 'err.noQuestions');
  const qAt = qi => `questions[${qi}]`;
  const ids = form.questions.map(q => q.id);
  checkKeys(ids, i => `q.${i}`, qAt, 'label.id');
  form.questions.forEach((q, qi) => {
    // by its id when the id names this question alone
    const at = q.id && ids.indexOf(q.id) === qi && ids.lastIndexOf(q.id) === qi ? `questions.${q.id}` : qAt(qi);
    if (isBlank(q.instructions)) problem(`q.${qi}.instructions`, `${at}.instructions`, 'err.noInstructions');
    if (q.type === 'noul') return;
    const { min, max } = LIMITS[q.type];
    if (q.criteria.length < min || q.criteria.length > max) {
      problem(`q.${qi}.criteria`, `${at}.criteria`, q.type === 'choice' ? 'err.optionCount' : 'err.levelCount', { min, max });
    }
    if (q.type === 'choice') checkKeys(q.criteria.map(r => r.key), i => `q.${qi}.c.${i}`, i => `${at}.criteria[${i}]`, 'label.key');
  });
  return errors;
}

// The errors found when the user saves or runs belong to the rows they are about, as `errors: { field: error }` on
// the form (state, questions), a question (id, instructions, criteria), a choice option or a state item (key).
// They stay until the next save or run, and go away with their row.
function holderOf(form, path) {
  const [first, i, part, j] = path.split('.');
  if (first === 'state' || first === 'questions') return i === undefined ? [form, first] : [form.state[i], 'key'];
  const q = form.questions[i];
  if (part === undefined) return [q, 'id'];
  if (part === 'c') return [q.criteria[j], 'key'];
  return [q, part];
}

// everything that can have errors: the form, its state items, its questions and their choice options
const holdersOf = form => [form, ...(typeof form.state === 'string' ? [] : form.state), ...form.questions,
  ...form.questions.flatMap(q => q.type === 'choice' ? q.criteria : [])];

// puts the errors of validate() on their rows, in place of the errors from the last check
export function attachErrors(form, errors) {
  holdersOf(form).forEach(holder => { holder.errors = {}; });
  for (const e of errors) {
    const [holder, field] = holderOf(form, e.path);
    holder.errors[field] = e;
  }
}

// whether any row still has an error from the last check (a row that is deleted takes its errors with it)
export const hasErrors = form => holdersOf(form).some(holder => holder.errors && Object.keys(holder.errors).length);

// the input of a form, without the errors on its rows: to tell whether it changed
export const formText = form => JSON.stringify(form, (key, value) => key === 'errors' ? undefined : value);

// the text of a scenario file
export const toFileText = form => JSON.stringify(toRequest(form), null, 2) + '\n';
