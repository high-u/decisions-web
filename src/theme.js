// The theme: light or dark. The page is drawn with the right one by the script at the top of index.html;
// the choice is saved only when the user switches.
import { i18n } from './i18n.js';
import { notifyError } from './notify.js';

const THEME_KEY = 'decision-web:theme';

export const theme = {
  dark: document.documentElement.classList.contains('dark'),
  set(dark) {
    this.dark = dark;
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (error) { notifyError(i18n.t('toast.themeSaveFailed'), error.message); }
  },
};
