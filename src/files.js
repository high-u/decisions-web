// File helpers for opening and saving scenarios. Nothing here is reactive state.

// Save overwrites the file a tab was opened from or saved to, where the browser can write files.
// Elsewhere a scenario is opened with a file input and saved as a download.
export const canWriteFiles = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
export const FILE_TYPES = [{ description: 'JSON', accept: { 'application/json': ['.json'] } }];

// file handles, kept outside Alpine: its proxies break the methods of browser objects
export const handles = new Map();

export const isAbort = error => error?.name === 'AbortError';

// false when the user does not allow writing to the file
export async function writeFile(handle, text) {
  if (handle.queryPermission && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted'
    && await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
    return false;
  }
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return true;
}

export function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const withJson = name => name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
