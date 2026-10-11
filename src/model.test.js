import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDownload, canDelete, stateOf, messageOf, cacheStatus, isNewVersion } from './model.js';

test('the model can be downloaded and deleted only in these statuses', () => {
  const allowed = {
    checking: [false, false],
    inOtherTab: [false, false],
    none: [true, false],
    downloading: [false, true],
    downloadFailed: [true, true],
    loading: [false, true],
    ready: [false, true],
    loadFailed: [false, true],
  };
  for (const [status, expected] of Object.entries(allowed)) {
    assert.deepEqual([canDownload(status), canDelete(status)], expected, status);
  }
});

test('entering a status does not carry over the progress, the error or the version notice of the previous one', () => {
  assert.deepEqual(stateOf('none'), { status: 'none', loaded: 0, total: 0, error: '', newVersion: false });
  assert.deepEqual(stateOf('downloadFailed', { error: 'HTTP 404' }), { status: 'downloadFailed', loaded: 0, total: 0, error: 'HTTP 404', newVersion: false });
});

test('an error thrown as a string keeps its text', () => {
  assert.equal(messageOf(new Error('HTTP 404')), 'HTTP 404');
  assert.equal(messageOf('data did not match any variant'), 'data did not match any variant');
});

test('files left by a download that did not finish are told from a complete or an empty cache', () => {
  const file = new Response('');
  assert.equal(cacheStatus([file, file, file]), 'complete');
  assert.equal(cacheStatus([file, undefined, undefined]), 'partial');
  assert.equal(cacheStatus([undefined, undefined, undefined]), 'empty');
});

test('a newer version is told only when the commit of the downloaded model is known', () => {
  assert.equal(isNewVersion('a1', 'b2'), true);
  assert.equal(isNewVersion('a1', 'a1'), false);
  assert.equal(isNewVersion(null, 'b2'), false);
});
