import Alpine from 'alpinejs';
import focus from '@alpinejs/focus';
import './style.css';
import { i18n } from './i18n.js';
import { errorText } from './messages.js';
import { icons } from './icons.js';
import { model, engine, start, downloadModel, deleteModel, checkNewVersion, canDownload, canDelete } from './model.js';
import { TYPES, APP_MODEL, defaultCriteria, newQuestion, emptyForm, canAddCriterion, checkRequest, fromRequest, toRequest, validate, errorKey, reportedErrors, toFileText } from './scenario.js';
import { SAMPLES } from '../samples.js';
import { systemone } from '../systemone.js';
import { registerWebMCP } from './webmcp.js';
import { notifyError, pageReady } from './notify.js';

const THEME_KEY = 'decision-web:theme';

// Save overwrites the file a tab was opened from or saved to, where the browser can write files.
// Elsewhere a scenario is opened with a file input and saved as a download.
const canWriteFiles = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
const FILE_TYPES = [{ description: 'JSON', accept: { 'application/json': ['.json'] } }];

// file handles, kept outside Alpine: its proxies break the methods of browser objects
const handles = new Map();

const isAbort = error => error?.name === 'AbortError';

// false when the user does not allow writing to the file
async function writeFile(handle, text) {
  if (handle.queryPermission && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted'
    && await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
    return false;
  }
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return true;
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}


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
  // tab: { id, name, form, savedText, reported, run: { status, error, response, ms, formText } }
  //   reported: the errors found when the user last saved or ran the tab, as errorKey()
  //   run.formText: the form the run was made with, to tell whether the input changed since
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
      if (status === 'downloadFailed') notifyError(this.t('toast.downloadFailed'), this.t(this.$store.model.error));
      if (status === 'loadFailed') notifyError(this.t('toast.loadFailed'), this.t(this.$store.model.error));
      // a model that could not be checked is taken as not downloaded; downloading again starts over
      if (status === 'none' && this.$store.model.error) notifyError(this.t('toast.checkFailed'), this.t(this.$store.model.error));
    });
    // the theme is the OS setting meanwhile (see the script at the top of index.html)
    const themeReadError = document.documentElement.dataset.themeReadError;
    if (themeReadError) notifyError(this.t('toast.themeReadFailed'), themeReadError);
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
    const tab = { id: crypto.randomUUID(), name, form, savedText: unsaved ? null : JSON.stringify(form), reported: [], run: null };
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
    tab.reported = [];
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

  // a file goes through the same checks as a scenario made in the editor; nested values become JSON text
  openText(name, text, handle) {
    let request;
    try {
      request = JSON.parse(text);
    } catch (error) {
      notifyError(this.t('toast.openFailed'), `${name}: ${error.message}`);
      return;
    }
    const invalid = checkRequest(request);
    const form = invalid.length ? null : fromRequest(request);
    const errors = invalid.length ? invalid : validate(form);
    if (errors.length) {
      notifyError(this.t('toast.openFailed'), [name, ...errors.map(e => this.describeError(e))].join('\n'));
      return;
    }
    this.addTab(name, form, { handle });
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
    this.newTab({ name: sample.name, form: fromRequest({ model: APP_MODEL, ...sample.request }) });
  },

  // the input is checked when the user saves or runs, not while typing. The errors found are shown under their rows
  // until they are fixed or the tab is checked again; errors made after the check wait for the next one.
  checkTab(tab, failedKey) {
    const errors = validate(tab.form);
    tab.reported = errors.map(errorKey);
    // the toast goes away with the last of these errors, or with the tab
    if (errors.length) {
      notifyError(this.t(failedKey), null, { closeWhen: () => !this.tabs.includes(tab) || !reportedErrors(tab.form, tab.reported).length });
    }
    return errors;
  },


  saved(tab) {
    tab.savedText = JSON.stringify(tab.form);
  },

  async save() {
    const tab = this.active;
    if (!tab || this.checkTab(tab, 'toast.saveInvalid').length) return;
    if (!canWriteFiles) {
      download(tab.name, toFileText(tab.form));
      this.saved(tab);
      return;
    }
    const handle = handles.get(tab.id);
    if (!handle) return this.saveAs();
    try {
      if (!await writeFile(handle, toFileText(tab.form))) return notifyError(this.t('toast.saveFailed'), this.t('save.denied'));
      this.saved(tab);
    } catch (error) {
      notifyError(this.t('toast.saveFailed'), error.message);
    }
  },

  async saveAs() {
    const tab = this.active;
    if (!tab || this.checkTab(tab, 'toast.saveInvalid').length) return;
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: tab.name, types: FILE_TYPES });
      if (!await writeFile(handle, toFileText(tab.form))) return notifyError(this.t('toast.saveFailed'), this.t('save.denied'));
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

  // the download dialog tells whether a newer version of the downloaded model is available
  openDownload() {
    this.downloadOpen = true;
    checkNewVersion().catch(error => notifyError(this.t('toast.versionCheckFailed'), error.message));
  },

  // download progress and errors, shown in the download modal
  modelText() {
    const m = this.$store.model;
    const mb = n => (n / 1e6).toFixed(0);
    if (m.status === 'downloading') {
      return this.t(m.total ? 'model.downloadingTotal' : 'model.downloading', { loaded: mb(m.loaded), total: mb(m.total) });
    }
    if (m.status === 'inOtherTab') return this.t('model.inOtherTab');
    return ['downloadFailed', 'loadFailed'].includes(m.status) ? this.t(`model.${m.status}`, { error: this.t(m.error) }) : '';
  },

  // --- language and mode, saved only when the user switches ---

  setLang(lang) { this.$store.i18n.set(lang); },

  setDark(dark) {
    this.dark = dark;
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (error) { notifyError(this.t('toast.themeSaveFailed'), error.message); }
  },

  // --- editor ---

  // the message under a row, or ''
  error(tab, path) {
    const e = reportedErrors(tab.form, tab.reported).find(e => e.path === path);
    return e ? errorText(this.language, e) : '';
  },

  // an error with where it is, for a toast
  describeError(e) { return `${e.at}: ${errorText(this.language, e)}`; },

  canAddCriterion,

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

  // whether the input changed after the last run; the result of the run stays shown
  runChanged(tab) { return !!tab.run && tab.run.formText !== JSON.stringify(tab.form); },

  // the same checks as saving, so that what runs is what the editor shows.
  // Returns tab.run when it ends, { status: 'invalid', errors } when the input has errors (tab.run is kept),
  // or null when the tab is already running.
  async runTab(tab) {
    if (!this.canRun(tab)) return null;
    const errors = this.checkTab(tab, 'toast.runInvalid');
    if (errors.length) return { status: 'invalid', errors };
    const formText = JSON.stringify(tab.form);
    const request = toRequest(tab.form);
    tab.run = { status: 'running', formText };
    try {
      const current = engine();
      if (!current) {
        const status = this.$store.model.status;
        throw new Error(this.t(status === 'inOtherTab' ? 'model.inOtherTab' : status === 'loading' ? 'run.loading' : status === 'loadFailed' ? 'run.notLoaded' : 'run.notDownloaded'));
      }
      const started = performance.now();
      const response = await systemone(current, request);
      const ms = Math.round(performance.now() - started);
      console.log(JSON.stringify(response, null, 2));
      tab.run = { status: 'done', response, ms, formText };
    } catch (error) {
      tab.run = { status: 'error', error: error.message ?? String(error), formText };
      notifyError(this.t('toast.runFailed'), tab.run.error);
    }
    return tab.run;
  },

  fmt: x => x.toFixed(4),
}));

window.Alpine = Alpine;
Alpine.start();
pageReady();
start(Alpine.store('model'));
