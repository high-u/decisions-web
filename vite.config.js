import tailwindcss from '@tailwindcss/vite';

// COOP/COEP make the page cross-origin isolated so ONNX Runtime WASM can use multiple threads.
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default {
  plugins: [tailwindcss()],
  server: { headers },
  preview: { headers },
};
