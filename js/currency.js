const CURRENCY_STORAGE_KEY = 'myk_currency';

// Currencies with no minor units in everyday display (e.g. JPY).
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY']);

function getCurrency() {
  return localStorage.getItem(CURRENCY_STORAGE_KEY) || 'USD';
}

function setCurrency(code) {
  localStorage.setItem(CURRENCY_STORAGE_KEY, code);
}

window.currencyList = [];

async function fetchCurrencies() {
  const res = await fetch('/api/currencies');
  if (!res.ok) return [];
  return res.json();
}

function rateOf(code) {
  const c = window.currencyList.find((c) => c.code === code);
  return c ? Number(c.rate) : 1;
}

function symbolOf(code) {
  const c = window.currencyList.find((c) => c.code === code);
  return c ? c.symbol : '$';
}

// Product prices are stored in USD. Conversion always pivots through CNY
// (the exchange-rate table's base currency, rate 1) per the site's forex setup.
window.convertFromUSD = function convertFromUSD(usdAmount, targetCode) {
  const cny = Number(usdAmount) / rateOf('USD');
  return cny * rateOf(targetCode);
};

window.formatPrice = function formatPrice(usdAmount) {
  const code = getCurrency();
  const amount = window.convertFromUSD(usdAmount, code);
  const decimals = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
  return `${symbolOf(code)}${amount.toFixed(decimals)}`;
};

// Re-formats every already-rendered price on the page from its data-price-usd
// attribute. Call after switching currency instead of re-fetching data.
window.reapplyCurrency = function reapplyCurrency() {
  document.querySelectorAll('[data-price-usd]').forEach((el) => {
    el.textContent = window.formatPrice(el.dataset.priceUsd);
  });
};

async function initCurrencySwitcher() {
  const trigger = document.getElementById('currencySwitcherTrigger');
  const menu = document.getElementById('currencySwitcherMenu');
  const label = document.getElementById('currentCurrencyLabel');
  if (!trigger || !menu) return;

  const current = getCurrency();
  const currentCurrency = window.currencyList.find((c) => c.code === current) || window.currencyList[0];
  if (label && currentCurrency) label.textContent = `${currentCurrency.code} ${currentCurrency.symbol}`;

  menu.innerHTML = window.currencyList
    .map((c) => `<button type="button" class="lang-option" data-currency="${c.code}">${escapeHtmlCurrency(c.name)} (${c.code} ${c.symbol})</button>`)
    .join('');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  document.addEventListener('click', () => menu.classList.remove('open'));

  menu.addEventListener('click', (e) => {
    const code = e.target.dataset.currency;
    if (!code) return;
    setCurrency(code);
    if (label) label.textContent = `${code} ${symbolOf(code)}`;
    menu.classList.remove('open');
    window.reapplyCurrency();
  });
}

function escapeHtmlCurrency(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

(async () => {
  window.currencyList = await fetchCurrencies();
  await initCurrencySwitcher();
  window.reapplyCurrency();
})();
