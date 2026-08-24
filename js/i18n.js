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

// Translates free-text CONTENT (product names, category names, section
// titles) as opposed to the fixed data-i18n UI labels above. Content has no
// per-string key of its own — it's admin-entered and mostly brand names
// ("LV", "GUCCI Bangle") plus a small, repeated vocabulary of jewelry terms
// — so instead of a key per string, translations/:code also carries
// `word.<lowercased text>` entries: a whole-phrase entry for short taglines
// ("word.shop now"), falling back to per-word substitution for everything
// else so "flower earrings" translates via word.flower + word.earrings
// without needing an entry for every product name individually. Any word
// with no dictionary entry (brand names, typos we haven't seen) is left as
// it was in the original text.
function translateContentText(text) {
  if (!text) return text;
  const dict = window.i18nDict || {};
  const phraseKey = `word.${text.trim().toLowerCase()}`;
  if (dict[phraseKey] !== undefined) return dict[phraseKey];

  const translated = text.replace(/[A-Za-z]+/g, (word) => {
    const key = `word.${word.toLowerCase()}`;
    return dict[key] !== undefined ? dict[key] : word;
  });
  // CJK scripts don't use spaces between words — collapse the ones left
  // over from joining word-by-word substitutions (e.g. "不锈" + " " +
  // "钢" -> "不锈钢"). No-op for scripts that do use spaces, like Arabic.
  return translated.replace(/([一-鿿])\s+(?=[一-鿿])/g, '$1');
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

  menu.addEventListener('click', (e) => {
    const code = e.target.dataset.locale;
    if (!code) return;
    setLocale(code);
    menu.classList.remove('open');
    // Reload rather than re-translating in place: data-i18n labels could be
    // patched live, but product/category names (translateContentText) are
    // baked into already-rendered HTML by each page's render function, so
    // only a fresh load re-runs those with the new language's dictionary.
    window.location.reload();
  });
}

function escapeHtmlI18n(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Exposed so other scripts (store.js's render functions) can await this
// before building HTML that includes translateContentText() calls — without
// it, a render that runs before this fetch resolves would bake in English
// permanently, since content translation happens at string-build time rather
// than via a re-scannable data-i18n attribute.
window.i18nReady = (async () => {
  await applyLocale(getLocale());
  initLanguageSwitcher();
})();
