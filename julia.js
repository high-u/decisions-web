function displayProbabilities(values) {
  const winner = values.indexOf(Math.max(...values));
  if (values[winner] > 0.95 && values.every((value, i) => i === winner || value < 0.045))
    return values.map((_, i) => Number(i === winner));
  const visible = values.map(x => x >= 0.01 ? x : 0);
  const total = visible.reduce((a, b) => a + b, 0);
  return visible.map(x => x / total);
}

export class JuliaCPU {
  static async load(baseUrl, { encoder, ...options }) {
    const engine = await this.create({ modelUrl: new URL('model.onnx', baseUrl).href, encoder, ...options });
    try {
      await engine.warm();
    } catch (error) {
      // the session is released when the model cannot run
      await engine.session.release();
      throw error;
    }
    return engine;
  }

  async warm() {
    await this.logits([{ state: '', question: 'Ready?', options: ['Yes', 'No'] }]);
    return this;
  }

  // model and weights: a URL, or the file contents as a Uint8Array
  static async create({ modelUrl, encoder, model = modelUrl, weights = `${modelUrl}.data`, maxLength = 1024, headLength = 256, strictEncoding = true }) {
    if (!encoder) throw new Error('A WasmEncoder is required');
    if (headLength + 4 >= maxLength) throw new RangeError('headLength leaves no context');
    // Loaded unbundled from public/ort: ORT re-imports itself in its thread workers, which breaks if Vite bundles it with page code.
    const ort = await import(/* @vite-ignore */ new URL('ort/ort.wasm.bundle.min.mjs', new URL(import.meta.env.BASE_URL, location.href)).href);
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(navigator.hardwareConcurrency ?? 4, 8) : 1;
    const weightsPath = new URL(modelUrl, location.href).pathname.split('/').pop() + '.data';
    const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', externalData: [{ path: weightsPath, data: weights }] });
    return new JuliaCPU(ort, session, encoder, maxLength, headLength, strictEncoding);
  }

  constructor(ort, session, encoder, maxLength, headLength, strictEncoding) {
    Object.assign(this, { ort, session, encoder, maxLength, headLength, strictEncoding });
  }

  async logits(rows) {
    if (!rows.length) return [];
    const items = rows.map(row =>
      JSON.parse(this.encoder.encode(JSON.stringify(row), this.maxLength, this.headLength, this.strictEncoding)));
    const batch = items.length;
    const length = Math.ceil(Math.max(...items.map(x => x.ids.length)) / 8) * 8;
    const count = Math.max(...items.map(x => x.markers.length));
    const ids = new BigInt64Array(batch * length);
    const attention = new BigInt64Array(batch * length);
    const positions = new BigInt64Array(batch * count);
    const mask = new Uint8Array(batch * count);
    const qtype = new BigInt64Array(batch);
    items.forEach((item, i) => {
      item.ids.forEach((id, j) => { ids[i * length + j] = BigInt(id); attention[i * length + j] = 1n; });
      item.markers.forEach((pos, j) => { positions[i * count + j] = BigInt(pos); mask[i * count + j] = 1; });
      qtype[i] = BigInt(item.qtype);
    });
    const ort = this.ort;
    const output = await this.session.run({
      input_ids: new ort.Tensor('int64', ids, [batch, length]),
      attention_mask: new ort.Tensor('int64', attention, [batch, length]),
      marker_pos: new ort.Tensor('int64', positions, [batch, count]),
      marker_mask: new ort.Tensor('bool', mask, [batch, count]),
      qtype: new ort.Tensor('int64', qtype, [batch]),
    });
    const values = await output.logits.getData();
    return items.map((item, i) => Array.from(values.slice(i * count, i * count + item.markers.length)));
  }

  async predict(rows) {
    return (await this.logits(rows)).map(values => {
      const peak = Math.max(...values);
      const weights = values.map(x => Math.exp(x - peak));
      const total = weights.reduce((a, b) => a + b, 0);
      return { index: values.indexOf(peak), probabilities: displayProbabilities(weights.map(x => x / total)) };
    });
  }
}
