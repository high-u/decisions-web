import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messages } from './messages.js';

const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

test('every string is in Japanese and English, with the same placeholders', () => {
  const { ja, en } = messages;
  assert.deepEqual(Object.keys(ja).sort(), Object.keys(en).sort());
  for (const key of Object.keys(ja)) assert.deepEqual(placeholders(ja[key]), placeholders(en[key]), key);
});
