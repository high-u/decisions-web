// The model is downloaded only with the download button, into the Cache Storage, and read from there.
// It is loaded into memory when the download ends, or when the page opens with the model already downloaded.
// The loaded model stays outside Alpine; only its status is in the Alpine store.

const HF = 'https://huggingface.co/SupersonicLabs/Julia-1-ONNX/resolve/main/';
const MODEL_CACHE = 'decision-web:model';
const MODEL_FILES = ['tokenizer.json', 'model.onnx', 'model.onnx.data'];

// status: checking | none | downloading | downloadFailed | loading | ready | loadFailed
export const model = { status: 'checking', loaded: 0, total: 0, error: '' };

let state = model; // the Alpine store once start() is called, so that changes reach the page
let downloading = null; // AbortController of the download in progress
let loading = null; // promise of the model being loaded, or loaded
let loadedEngine = null;

export const engine = () => loadedEngine;

const set = values => Object.assign(state, values);

async function cachedFiles() {
  const cache = await caches.open(MODEL_CACHE);
  return Promise.all(MODEL_FILES.map(name => cache.match(HF + name)));
}

async function modelFile(name) {
  const response = await (await caches.open(MODEL_CACHE)).match(HF + name);
  return new Uint8Array(await response.arrayBuffer());
}

function load() {
  set({ status: 'loading', error: '' });
  const promise = loading = (async () => {
    const { JuliaCPU } = await import('../julia.js');
    const wasm = await import('../wasm/julia_webgpu_encode.js');
    await wasm.default();
    const [tokenizer, modelData, weights] = await Promise.all(MODEL_FILES.map(modelFile));
    const encoder = new wasm.WasmEncoder(new TextDecoder().decode(tokenizer));
    return JuliaCPU.load(HF, { encoder, model: modelData, weights });
  })();
  promise.then(loaded => {
    if (loading !== promise) return;
    loadedEngine = loaded;
    set({ status: 'ready' });
  }, error => {
    if (loading !== promise) return;
    loading = null;
    set({ status: 'loadFailed', error: error.message });
  });
}

export async function start(store) {
  state = store;
  let ready = false;
  try { ready = (await cachedFiles()).every(Boolean); } catch {}
  if (ready) load();
  else set({ status: 'none' });
}

export async function downloadModel() {
  const controller = downloading = new AbortController();
  set({ status: 'downloading', loaded: 0, total: 0, error: '' });
  try {
    const cache = await caches.open(MODEL_CACHE);
    const cached = await cachedFiles();
    const missing = MODEL_FILES.filter((_, i) => !cached[i]);
    const responses = await Promise.all(missing.map(name => fetch(HF + name, { cache: 'no-store', signal: controller.signal })));
    const failed = responses.find(r => !r.ok);
    if (failed) throw new Error(`HTTP ${failed.status}`);
    let loaded = 0;
    set({ total: responses.reduce((sum, r) => sum + Number(r.headers.get('content-length') ?? 0), 0) });
    await Promise.all(responses.map((response, i) => {
      const counted = response.body.pipeThrough(new TransformStream({
        transform(chunk, out) { loaded += chunk.byteLength; set({ loaded }); out.enqueue(chunk); },
      }));
      return cache.put(HF + missing[i], new Response(counted, { headers: response.headers }));
    }));
    if (downloading !== controller) return;
    downloading = null;
    load();
  } catch (error) {
    if (downloading !== controller) return;
    downloading = null;
    set({ status: 'downloadFailed', error: error.message });
  }
}

export async function deleteModel() {
  downloading?.abort();
  downloading = null;
  const loaded = await loading?.catch(() => null);
  loading = null;
  loadedEngine = null;
  await loaded?.session.release();
  await caches.delete(MODEL_CACHE);
  set({ status: 'none', error: '' });
}
