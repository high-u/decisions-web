// The UI language: the browser language unless the user chose one, saved only when the user switches.
import { messages, translate } from './messages.js';
import { notifyError } from './notify.js';

const LANG_KEY = 'decision-web:lang';

let readError = null;
let saved = null;
try { saved = localStorage.getItem(LANG_KEY); } catch (error) { readError = error; }

const initial = saved ?? (navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en');

export const i18n = {
  lang: messages[initial] ? initial : 'en',
  t(key, params) { return translate(this.lang, key, params); },
  // saved only when the user switches
  set(lang) {
    this.lang = lang;
    document.documentElement.lang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (error) { notifyError(this.t('toast.languageSaveFailed'), error.message); }
  },
};

document.documentElement.lang = i18n.lang;
// the language is the browser's meanwhile
if (readError) notifyError(i18n.t('toast.languageReadFailed'), readError.message);
