import Alpine from 'alpinejs';
import focus from '@alpinejs/focus';
import './style.css';
import { i18n } from './i18n.js';
import { icons } from './icons.js';
import { model, engine, start, downloadModel, deleteModel, canDownload, canDelete } from './model.js';
import { TYPES, defaultCriteria, newQuestion, emptyForm, fromRequest, toRequest, validate, toFileText } from './scenario.js';
import { SAMPLES } from '../samples.js';
import { systemone } from '../systemone.js';
import { registerWebMCP } from './webmcp.js';

const THEME_KEY = 'decision-web:theme';

// Save overwrites the file a tab was opened from or saved to, where the browser can write files.
// Elsewhere a scenario is opened with a file input and saved as a download.
const canWriteFiles = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
const FILE_TYPES = [{ description: 'JSON', accept: { 'application/json': ['.json'] } }];

// file handles, kept outside Alpine: its proxies break the methods of browser objects
const handles = new Map();

const isAbort = error => error?.name === 'AbortError';

async function writeFile(handle, text) {
  if (handle.queryPermission && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted'
    && await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
    throw new Error('permission denied');
  }
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// errors are shown with the Penguin stacking toast in index.html
const notifyError = (title, message = null) =>
  window.dispatchEvent(new CustomEvent('notify', { detail: { variant: 'danger', title, message } }));

const withJson = name => name.toLowerCase().endsWith('.json') ? name : `${name}.json`;

Alpine.plugin(focus);
Alpine.store('i18n', i18n);
Alpine.store('model', model);

Alpine.data('app', () => ({
  icons,
  TYPES,
  canWriteFiles,
  showSidebar: false,
  dark: document.documentElement.classList.contains('dark'),
  // tab: { id, name, form, savedText, errors, run: { status, error, response, ms } }
  tabs: [],
  activeId: null,
  untitledCount: 0,
  closing: null, // tab waiting for the close confirmation
  samplesOpen: false,

  init() {
    // the browser asks before leaving when a tab has unsaved changes
    window.addEventListener('beforeunload', e => {
      if (this.tabs.some(tab => this.isDirty(tab))) e.preventDefault();
    });
    this.$watch('$store.model.status', status => {
      if (status === 'downloadFailed') notifyError(this.t('toast.downloadFailed'), this.$store.model.error);
      if (status === 'loadFailed') notifyError(this.t('toast.loadFailed'), this.$store.model.error);
    });
    // the page opens as if New was pressed once
    this.newTab();
    registerWebMCP(this);
  },

  t(key, params) { return this.$store.i18n.t(key, params); },

  get active() { return this.findTab(this.activeId); },
  get samples() { return SAMPLES[this.$store.i18n.lang] ?? SAMPLES.en; },
  get language() { return this.$store.i18n.lang; },
  get modelState() { return this.$store.model; },

  // --- tabs ---

  findTab(id) { return this.tabs.find(tab => tab.id === id); },

  // unsaved: the tab starts with unsaved changes, for content the user has not saved anywhere yet
  addTab(name, form, { handle = null, unsaved = false } = {}) {
    const tab = { id: crypto.randomUUID(), name, form, savedText: unsaved ? null : JSON.stringify(form), errors: {}, run: null };
    if (handle) handles.set(tab.id, handle);
    this.tabs.push(tab);
    this.showSidebar = false;
    const added = this.findTab(tab.id);
    this.showTab(added);
    return added;
  },

  showTab(tab) { this.activeId = tab.id; },

  // replaces the whole content; errors found on the old rows no longer apply
  setForm(tab, form) {
    tab.form = form;
    tab.errors = {};
  },

  isDirty(tab) { return JSON.stringify(tab.form) !== tab.savedText; },

  requestClose(tab) {
    if (this.isDirty(tab)) this.closing = tab;
    else this.close(tab);
  },

  close(tab) {
    const i = this.tabs.indexOf(tab);
    this.tabs.splice(i, 1);
    handles.delete(tab.id);
    if (this.activeId === tab.id) this.activeId = this.tabs[Math.min(i, this.tabs.length - 1)]?.id ?? null;
    this.closing = null;
  },

  // --- file operations ---

  // without a name, the tab is named "Untitled <n>.json" in the UI language
  newTab({ name = null, form = emptyForm(), unsaved = false } = {}) {
    const tabName = name ? withJson(name) : `${this.t('untitled', { n: ++this.untitledCount })}.json`;
    return this.addTab(tabName, form, { unsaved });
  },

  openText(name, text, handle) {
    try {
      this.addTab(name, fromRequest(JSON.parse(text)), { handle });
    } catch (error) {
      notifyError(this.t('toast.openFailed'), `${name}: ${error.message}`);
    }
  },

  async open() {
    if (!canWriteFiles) {
      this.$refs.fileInput.click();
      return;
    }
    let picked;
    try {
      picked = await window.showOpenFilePicker({ types: FILE_TYPES, multiple: true });
    } catch (error) {
      if (!isAbort(error)) notifyError(this.t('toast.openFailed'), error.message);
      return;
    }
    for (const handle of picked) {
      const file = await handle.getFile();
      this.openText(file.name, await file.text(), handle);
    }
  },

  async openInput(e) {
    for (const file of e.target.files) this.openText(file.name, await file.text(), null);
    e.target.value = '';
  },

  openSample(sample) {
    this.samplesOpen = false;
    this.newTab({ name: sample.name, form: fromRequest(sample.request) });
  },

  // validation errors stay on the tab, under their rows
  checkSave(tab) {
    tab.errors = validate(tab.form);
    const valid = !Object.keys(tab.errors).length;
    if (!valid) notifyError(this.t('toast.saveInvalid'));
    return valid;
  },

  saved(tab) {
    tab.savedText = JSON.stringify(tab.form);
  },

  async save() {
    const tab = this.active;
    if (!tab || !this.checkSave(tab)) return;
    if (!canWriteFiles) {
      download(tab.name, toFileText(tab.form));
      this.saved(tab);
      return;
    }
    const handle = handles.get(tab.id);
    if (!handle) return this.saveAs();
    try {
      await writeFile(handle, toFileText(tab.form));
      this.saved(tab);
    } catch (error) {
      notifyError(this.t('toast.saveFailed'), error.message);
    }
  },

  async saveAs() {
    const tab = this.active;
    if (!tab || !this.checkSave(tab)) return;
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: tab.name, types: FILE_TYPES });
      await writeFile(handle, toFileText(tab.form));
      handles.set(tab.id, handle);
      tab.name = handle.name;
      this.saved(tab);
    } catch (error) {
      if (!isAbort(error)) notifyError(this.t('toast.saveFailed'), error.message);
    }
  },

  // --- model ---

  downloadModel,
  deleteModel,
  canDownloadModel() { return canDownload(this.$store.model.status); },
  canDeleteModel() { return canDelete(this.$store.model.status); },

  downloadOpen: false,

  // download progress and errors, shown in the download modal
  modelText() {
    const m = this.$store.model;
    const mb = n => (n / 1e6).toFixed(0);
    if (m.status === 'downloading') {
      return this.t(m.total ? 'model.downloadingTotal' : 'model.downloading', { loaded: mb(m.loaded), total: mb(m.total) });
    }
    return ['downloadFailed', 'loadFailed'].includes(m.status) ? this.t(`model.${m.status}`, { error: m.error }) : '';
  },

  // --- language and mode, saved only when the user switches ---

  setLang(lang) { this.$store.i18n.set(lang); },

  setDark(dark) {
    this.dark = dark;
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch {}
  },

  // --- editor ---

  error(tab, path) {
    const e = tab.errors[path];
    return e ? this.t(e.code, { label: this.t(e.label), key: e.key }) : '';
  },

  setStateMode(tab, text) {
    // switching clears the content
    tab.form.state = text ? '' : [{ key: '', value: '' }];
  },

  setType(q, type) {
    q.type = type;
    q.criteria = defaultCriteria(type);
  },

  addQuestion(tab) {
    let n = tab.form.questions.length + 1;
    while (tab.form.questions.some(q => q.id === `q${n}`)) n++;
    tab.form.questions.push(newQuestion(`q${n}`));
  },

  // --- run ---

  canRun(tab) { return tab.run?.status !== 'running'; },

  // returns tab.run when it ends, or null when the tab is already running
  async runTab(tab) {
    if (!this.canRun(tab)) return null;
    const request = toRequest(tab.form);
    tab.run = { status: 'running' };
    try {
      const current = engine();
      if (!current) {
        const status = this.$store.model.status;
        throw new Error(this.t(status === 'loading' ? 'run.loading' : status === 'loadFailed' ? 'run.notLoaded' : 'run.notDownloaded'));
      }
      const started = performance.now();
      const response = await systemone(current, request);
      const ms = Math.round(performance.now() - started);
      console.log(JSON.stringify(response, null, 2));
      tab.run = { status: 'done', response, ms };
    } catch (error) {
      tab.run = { status: 'error', error: error.message ?? String(error) };
      notifyError(this.t('toast.runFailed'), tab.run.error);
    }
    return tab.run;
  },

  fmt: x => x.toFixed(4),
}));

window.Alpine = Alpine;
Alpine.start();
start(Alpine.store('model'));
