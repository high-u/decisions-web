import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_MODEL, checkRequest, fromRequest, toRequest, validate, errorKey, reportedErrors } from './scenario.js';
import { LANGS, translate, errorText } from './messages.js';
import { SAMPLES } from '../samples.js';

// every error has a message in every language, not the code itself
function assertMessages(errors) {
  for (const e of errors) {
    for (const lang of LANGS) {
      assert.notEqual(translate(lang, e.code), e.code, `${lang}: no message for ${e.code}`);
      if (e.params?.label) assert.ok(!errorText(lang, e).includes('label.'), `${lang}: no label for ${e.params.label}`);
    }
  }
}

test('samples pass every check and convert back unchanged', () => {
  for (const sample of Object.values(SAMPLES).flat()) {
    const request = { model: APP_MODEL, ...sample.request };
    assert.deepEqual(checkRequest(request, { nested: false }), [], sample.name);
    const form = fromRequest(request);
    assert.deepEqual(validate(form), [], sample.name);
    assert.deepEqual(toRequest(form), request, sample.name);
  }
});

test('an opened file keeps its model, or stays without one', () => {
  const request = { state: 's', questions: { q: { type: 'noul', instructions: 'Is it?' } } };
  assert.deepEqual(toRequest(fromRequest(request)), request);
  assert.equal(toRequest(fromRequest({ model: 'jev-latest', ...request })).model, 'jev-latest');
});

test('nested values become JSON text in an opened file, and are rejected from a tool', () => {
  const request = {
    state: { order: { id: 7 } },
    questions: { q: { type: 'choice', instructions: ['a', 'b'], criteria: { k: { x: 1 }, n: null } } },
  };
  assert.deepEqual(checkRequest(request), []);
  const form = fromRequest(request);
  assert.equal(form.state[0].value, '{"id":7}');
  assert.equal(form.questions[0].instructions, '["a","b"]');
  assert.deepEqual(form.questions[0].criteria, [{ key: 'k', description: '{"x":1}' }, { key: 'n', description: '' }]);

  const errors = checkRequest(request, { nested: false });
  assert.deepEqual(errors.map(e => [e.at, e.code]), [
    ['state.order', 'err.notString'],
    ['questions.q.instructions', 'err.notString'],
    ['questions.q.criteria.k', 'err.notStringOrNull'],
  ]);
  assertMessages(errors);
});

test('a request the editor cannot hold is rejected where it is wrong, not changed', () => {
  const q = { type: 'noul', instructions: 'Is it?' };
  const cases = [
    [[], '', 'err.notObject'],
    [{ questions: { q } }, 'state', 'err.missing'],
    [{ state: ['a'], questions: { q } }, 'state', 'err.stateType'],
    [{ state: 's' }, 'questions', 'err.missing'],
    [{ state: 's', questions: { q }, extra: 1 }, 'extra', 'err.unknownField'],
    [{ state: 's', questions: { q: { ...q, type: 'yesno' } } }, 'questions.q.type', 'err.type'],
    [{ state: 's', questions: { q: { type: 'noul' } } }, 'questions.q.instructions', 'err.missing'],
    [{ state: 's', questions: { q: { type: 'choice', instructions: 'Which?' } } }, 'questions.q.criteria', 'err.missing'],
    [{ state: 's', questions: { q: { type: 'score', instructions: 'How?', criteria: { a: 'x' } } } }, 'questions.q.criteria', 'err.scoreCriteria'],
    [{ state: 's', questions: { q: { ...q, criteria: { yes: 'x' } } } }, 'questions.q.criteria.yes', 'err.noulKey'],
    [{ model: 1, state: 's', questions: { q } }, 'model', 'err.notString'],
  ];
  for (const [request, at, code] of cases) {
    const errors = checkRequest(request);
    assert.deepEqual(errors.map(e => [e.at, e.code]), [[at, code]], JSON.stringify(request));
    assertMessages(errors);
  }
});

test('a form that cannot be saved or run is rejected under the row that is wrong', () => {
  const valid = () => ({
    model: APP_MODEL,
    state: [{ key: 'message', value: 'Hello' }],
    questions: [
      { id: 'route', type: 'choice', instructions: 'Which?', criteria: [{ key: 'a', description: '' }, { key: 'b', description: '' }] },
      { id: 'level', type: 'score', instructions: 'How?', criteria: ['low', 'high'] },
    ],
  });
  const options = n => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, description: '' }));
  const cases = [
    [f => { f.state = ' '; }, 'state', 'err.noState'],
    [f => { f.state[0].value = ''; }, 'state', 'err.noState'],
    [f => { f.state.push({ key: '', value: 'x' }); }, 'state.1', 'err.empty'],
    [f => { f.state.push({ key: 'message', value: 'x' }); }, 'state.1', 'err.duplicate'],
    [f => { f.questions = []; }, 'questions', 'err.noQuestions'],
    [f => { f.questions[1].id = 'route'; }, 'q.1', 'err.duplicate'],
    [f => { f.questions[0].instructions = ' '; }, 'q.0.instructions', 'err.noInstructions'],
    [f => { f.questions[0].criteria = options(1); }, 'q.0.criteria', 'err.optionCount'],
    [f => { f.questions[0].criteria = options(21); }, 'q.0.criteria', 'err.optionCount'],
    [f => { f.questions[1].criteria = ['x']; }, 'q.1.criteria', 'err.levelCount'],
    [f => { f.questions[1].criteria = Array(11).fill('x'); }, 'q.1.criteria', 'err.levelCount'],
    [f => { f.questions[0].criteria[1].key = 'a'; }, 'q.0.c.1', 'err.duplicate'],
    [f => { f.questions[0].criteria[1].key = '1'; }, 'q.0.c.1', 'err.numeric'],
  ];
  assert.deepEqual(validate(valid()), []);
  // the limits themselves are allowed
  const limits = valid();
  limits.questions[0].criteria = options(20);
  limits.questions[1].criteria = Array(10).fill('x');
  assert.deepEqual(validate(limits), []);

  for (const [change, path, code] of cases) {
    const form = valid();
    change(form);
    const errors = validate(form);
    assert.deepEqual(errors.map(e => [e.path, e.code]), [[path, code]], change.toString());
    assertMessages(errors);
  }
});

test('a reported error is shown until it is fixed, and a new error waits for the next check', () => {
  const form = { model: null, state: 's', questions: [{ id: 'q', type: 'noul', instructions: '', criteria: { true: '', false: '' } }] };
  const reported = validate(form).map(errorKey);
  assert.deepEqual(reportedErrors(form, reported).map(e => e.path), ['q.0.instructions']);

  form.questions[0].instructions = 'Is it?';
  form.state = '';
  assert.deepEqual(reportedErrors(form, reported), []);
  assert.deepEqual(validate(form).map(e => e.path), ['state']);
});
