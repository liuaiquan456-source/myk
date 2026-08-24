const LOCALE_STORAGE_KEY = 'myk_locale';

function getLocale() {
  return localStorage.getItem(LOCALE_STORAGE_KEY) || 'en';
}

function setLocale(code) {
  localStorage.setItem(LOCALE_STORAGE_KEY, code);
}

async function fetchTranslations(code) {
  // no-store: the admin can add/edit locales at any time, and a browser that
  // cached this before a new language existed would otherwise keep serving
  // that stale response indefinitely (fetch() honors HTTP caching by default
  // same as any other resource — this isn't automatically bypassed).
  const res = await fetch(`/api/translations/${code}`, { cache: 'no-store' });
  if (!res.ok) return {};
  return res.json();
}

window.i18nDict = {};

function applyTranslations(dict) {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) el.textContent = dict[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (dict[key] !== undefined) el.placeholder = dict[key];
  });
}

// Re-applies the currently loaded dictionary. Call this after injecting
// dynamic content (e.g. product cards) that carries data-i18n attributes.
window.reapplyI18n = function reapplyI18n() {
  applyTranslations(window.i18nDict);
};

async function applyLocale(code) {
  const dict = await fetchTranslations(code);
  window.i18nDict = dict;
  applyTranslations(dict);
  return dict;
}

async function initLanguageSwitcher() {
  const trigger = document.getElementById('langSwitcherTrigger');
  const menu = document.getElementById('langSwitcherMenu');
  const label = document.getElementById('currentLocaleLabel');
  if (!trigger || !menu) return;

  const locales = await (await fetch('/api/locales', { cache: 'no-store' })).json();
  const current = getLocale();
  const currentLocale = locales.find((l) => l.code === current) || locales[0];
  if (label) label.textContent = currentLocale.nativeName;

  menu.innerHTML = locales
    .map((l) => `<button type="button" class="lang-option" data-locale="${l.code}">${escapeHtmlI18n(l.nativeName)}</button>`)
    .join('');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  document.addEventListener('click', () => menu.classList.remove('open'));

  menu.addEventListener('click', async (e) => {
    const code = e.target.dataset.locale;
    if (!code) return;
    setLocale(code);
    if (label) label.textContent = e.target.textContent;
    menu.classList.remove('open');
    await applyLocale(code);
  });
}

function escapeHtmlI18n(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

(async () => {
  await applyLocale(getLocale());
  initLanguageSwitcher();
})();
