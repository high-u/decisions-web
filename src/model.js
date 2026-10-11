// The model is downloaded only with the download button, into the Cache Storage, and read from there.
// It is loaded into memory when the download ends, or when the page opens with the model already downloaded.
// The loaded model stays outside Alpine; only its status is in the Alpine store.
// A download takes the latest version at that time, every file from the same commit. A download that does not
// finish leaves nothing behind. Only one tab of this app uses the model: the first to open holds a Web Lock until it
// closes, and the others cannot use the model (inOtherTab) until they are reloaded after that.

const REPO = 'SupersonicLabs/Julia-1-ONNX';
const HF = `https://huggingface.co/${REPO}/`;
const MODEL_CACHE = 'decision-web:model';
const MODEL_FILES = ['tokenizer.json', 'model.onnx', 'model.onnx.data'];
const LOCK = 'decision-web:model';

// cache keys: the URLs the first versions of this app downloaded from, so that a model downloaded then is still found;
// and the commit the files came from (not there for a model downloaded by those versions)
const fileKey = name => `${HF}resolve/main/${name}`;
const COMMIT_KEY = `${HF}commit`;

// input length in tokens, per question: the whole input, and the part for the instructions and the options.
// As published for Julia-1 in https://huggingface.co/SupersonicLabs/Julia-1/blob/main/inference-policy.json
const MAX_LENGTH = 8192;
const HEAD_LENGTH = 512;

// status: checking | inOtherTab | none | downloading | downloadFailed | loading | ready | loadFailed
// loaded and total: bytes of the download in progress, 0 in other statuses.
// error: why the last step failed (with none: why the downloaded model could not be checked): a key of messages.js for the reasons of this app, or the message of the error.
// newVersion: whether the repository has a newer commit than the downloaded model (see checkNewVersion).
// The whole state on entering a status: what the previous status had is not carried over.
export const stateOf = (status, values = {}) => ({ loaded: 0, total: 0, error: '', newVersion: false, ...values, status });

export const model = stateOf('checking');

let state = model; // the Alpine store once start() is called, so that changes reach the page

// what belongs to the status but cannot be in the store (Alpine proxies break these objects)
let downloading = null; // AbortController of the download in progress
let loading = null; // promise of the model being loaded, or loaded
let loadedEngine = null;

export const engine = () => loadedEngine;

// whether the model can be downloaded or deleted in a status; the buttons and the operations below follow these
export const canDownload = status => status === 'none' || status === 'downloadFailed';
export const canDelete = status => !['checking', 'inOtherTab', 'none'].includes(status);

// every change of status goes through here
const to = (status, values) => Object.assign(state, stateOf(status, values));

// the text of an error, which may also be thrown as a string (the WASM encoder does so)
export const messageOf = error => error instanceof Error ? error.message : String(error);

// the model files found in the cache: all of them, some (left by a download that did not finish), or none
export const cacheStatus = files => files.every(Boolean) ? 'complete' : files.some(Boolean) ? 'partial' : 'empty';

// whether the repository has a newer commit; not known (false) for a model whose commit was not kept
export const isNewVersion = (downloaded, latest) => !!downloaded && downloaded !== latest;

async function cachedFiles() {
  const cache = await caches.open(MODEL_CACHE);
  return Promise.all(MODEL_FILES.map(name => cache.match(fileKey(name))));
}

async function modelFile(name) {
  const response = await (await caches.open(MODEL_CACHE)).match(fileKey(name));
  return new Uint8Array(await response.arrayBuffer());
}

// the latest commit of the model repository
async function latestCommit(signal) {
  const response = await fetch(`https://huggingface.co/api/models/${REPO}/revision/main`, { cache: 'no-store', referrerPolicy: 'no-referrer', signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()).sha;
}

// the commit the downloaded model came from, or null when it is not known
async function downloadedCommit() {
  const response = await (await caches.open(MODEL_CACHE)).match(COMMIT_KEY);
  return response ? response.text() : null;
}

function load() {
  to('loading');
  const promise = loading = (async () => {
    const { JuliaCPU } = await import('../julia.js');
    const wasm = await import('../wasm/julia_webgpu_encode.js');
    await wasm.default();
    const [tokenizer, modelData, weights] = await Promise.all(MODEL_FILES.map(modelFile));
    const encoder = new wasm.WasmEncoder(new TextDecoder().decode(tokenizer));
    return JuliaCPU.load(`${HF}resolve/main/`, { encoder, model: modelData, weights, maxLength: MAX_LENGTH, headLength: HEAD_LENGTH });
  })();
  promise.then(loaded => {
    if (loading !== promise) return;
    loadedEngine = loaded;
    to('ready');
  }, error => {
    if (loading !== promise) return;
    loading = null;
    to('loadFailed', { error: messageOf(error) });
  });
}

// whether this tab is the one that uses the model: it holds the lock until it closes, and the browser then releases it.
// Another tab holding it does not make this one wait.
function takeModel() {
  return new Promise((resolve, reject) => {
    navigator.locks.request(LOCK, { ifAvailable: true }, lock => {
      resolve(lock !== null);
      return lock && new Promise(() => {});
    }).catch(reject);
  });
}

export async function start(store) {
  state = store;
  let ready;
  try {
    if (!await takeModel()) {
      to('inOtherTab');
      return;
    }
    // files left by a download that did not finish (the tab was closed) are removed
    const status = cacheStatus(await cachedFiles());
    if (status === 'partial') await caches.delete(MODEL_CACHE);
    ready = status === 'complete';
  } catch (error) {
    // taken as not downloaded, with the reason; downloading again starts from an empty cache
    to('none', { error: messageOf(error) });
    return;
  }
  if (ready) load();
  else to('none');
}

export async function downloadModel() {
  if (!canDownload(state.status)) return;
  const controller = downloading = new AbortController();
  // progress of this download only: a deleted or replaced download no longer changes the store
  const progress = values => { if (downloading === controller) Object.assign(state, values); };
  to('downloading');
  try {
    const commit = await latestCommit(controller.signal);
    await caches.delete(MODEL_CACHE);
    const cache = await caches.open(MODEL_CACHE);
    const responses = await Promise.all(MODEL_FILES.map(name =>
      fetch(`${HF}resolve/${commit}/${name}`, { cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal })));
    const failed = responses.find(r => !r.ok);
    if (failed) throw new Error(`HTTP ${failed.status}`);
    let loaded = 0;
    progress({ total: responses.reduce((sum, r) => sum + Number(r.headers.get('content-length') ?? 0), 0) });
    await Promise.all(responses.map((response, i) => {
      const counted = response.body.pipeThrough(new TransformStream({
        transform(chunk, out) { loaded += chunk.byteLength; progress({ loaded }); out.enqueue(chunk); },
      }));
      return cache.put(fileKey(MODEL_FILES[i]), new Response(counted, { headers: response.headers }));
    }));
    await cache.put(COMMIT_KEY, new Response(commit));
    if (downloading !== controller) return;
    downloading = null;
    load();
  } catch (error) {
    // deleted meanwhile: deleteModel() removes the files
    if (downloading !== controller) return;
    downloading = null;
    await caches.delete(MODEL_CACHE);
    to('downloadFailed', { error: messageOf(error) });
  }
}

export async function deleteModel() {
  if (!canDelete(state.status)) return;
  downloading?.abort();
  downloading = null;
  const loaded = await loading?.catch(() => null);
  loading = null;
  loadedEngine = null;
  await loaded?.session.release();
  await caches.delete(MODEL_CACHE);
  to('none');
}

// sets newVersion when the repository has a newer commit than the downloaded model.
// Not known for a model downloaded by the first versions of this app, which did not keep the commit.
export async function checkNewVersion() {
  const status = state.status;
  if (!['loading', 'ready', 'loadFailed'].includes(status)) return;
  const commit = await downloadedCommit();
  if (!commit) return;
  const latest = await latestCommit();
  if (state.status === status) Object.assign(state, { newVersion: isNewVersion(commit, latest) });
}
