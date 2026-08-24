const localeRows = document.getElementById('localeRows');
const localeSelect = document.getElementById('localeSelect');
const translationGroups = document.getElementById('translationGroups');
const languageModal = document.getElementById('languageModal');
const languageForm = document.getElementById('languageForm');

const KEY_GROUPS = [
  ['首页', ['hero.customInquiry']],
  ['联系方式悬浮卡片', ['contact.whatsapp', 'contact.wechat', 'contact.email', 'contact.address']],
  ['导航栏 / 公告条', [
    'nav.bestsellers', 'nav.newIn', 'nav.shopBy', 'nav.necklaces', 'nav.bracelets',
    'nav.rings', 'nav.earrings', 'nav.collections', 'nav.aboutUs',
    'announcement.freeShipping', 'common.home',
  ]],
  ['板块标题', ['section.viewAll', 'section.youMayAlsoLike']],
  ['信任标识', ['trust.fairPricing', 'trust.ethicallyMade', 'trust.returns30', 'trust.reviews', 'trust.warranty100']],
  ['页脚', [
    'footer.aboutUs', 'footer.ourStory', 'footer.sustainability', 'footer.careers',
    'footer.helpCenter', 'footer.shippingInfo', 'footer.returns', 'footer.faq', 'footer.contactUs',
    'footer.followUs', 'footer.newsletter', 'footer.emailPlaceholder', 'footer.subscribe', 'footer.copyright',
  ]],
  ['商品列表页', ['listing.sortBy', 'listing.filter', 'listing.addToBag', 'listing.notifyMe', 'listing.show']],
  ['商品详情页', [
    'pdp.color', 'pdp.size', 'pdp.addToBag', 'pdp.shipsWithin24', 'pdp.returns30', 'pdp.warranty100',
    'pdp.detailsMaterials', 'pdp.sizing', 'pdp.careInstructions', 'pdp.shippingReturns', 'pdp.reviews',
    'pdp.frequentlyBoughtTogether', 'pdp.addSelectedToBag', 'pdp.totalPrice',
  ]],
  ['购物车 / 结账', [
    'cart.title', 'cart.empty', 'cart.continueShopping', 'cart.subtotal', 'cart.checkout',
    'cart.fullName', 'cart.email', 'cart.shippingAddress', 'cart.orderNote', 'cart.placeOrder', 'cart.thankYou',
  ]],
  ['心愿单', ['wishlist.title', 'wishlist.empty', 'wishlist.startShopping']],
  // Not fixed UI labels — a small word/phrase glossary that
  // translateContentText() (js/i18n.js) uses to translate admin-entered
  // CONTENT (product names, category names, section titles) on the fly,
  // since those are free text with no key of their own. A phrase entry
  // (spaces intact) is tried whole first; anything else falls back to
  // per-word substitution, so most products need no entry at all — just
  // the handful of real words their names are built from.
  ['商品 / 分类词汇（自动翻译商品名用）', [
    'word.new collection', 'word.shop now', 'word.elevate your everyday',
    'word.new drops · every thursday', 'word.trending now', 'word.brand jewelry',
    'word.ss jewelry', 'word.silver collection', 'word.stainless steel jewerly',
    'word.stainless steel jewelry', 'word.earrings', 'word.earings', 'word.earing',
    'word.erings', 'word.ring', 'word.rings', 'word.rig', 'word.necklace',
    'word.necklcae', 'word.cklace', 'word.necklacee', 'word.bracelet', 'word.bracelets',
    'word.bangle', 'word.clover', 'word.clovers', 'word.jewelry', 'word.jewerly',
    'word.new', 'word.collection', 'word.now', 'word.chain', 'word.blue', 'word.flower',
    'word.brand', 'word.stainless', 'word.steel', 'word.silver', 'word.trending',
    'word.shop', 'word.gold', 'word.rose gold', 'word.black', 'word.white',
  ]],
];

let locales = [];
let currentDict = {};
let currentCode = 'en';

async function loadLocales() {
  locales = await api('/api/locales');
  renderLocaleRows();
  populateLocaleSelect();
  if (!locales.some((l) => l.code === currentCode)) currentCode = locales[0].code;
  await loadTranslationsForLocale(currentCode);
}

function renderLocaleRows() {
  localeRows.innerHTML = locales.map((l) => `
    <tr>
      <td><code>${l.code}</code></td>
      <td>${escapeHtml(l.name)}</td>
      <td>${escapeHtml(l.nativeName)}</td>
      <td class="row-actions">
        ${l.code === 'en'
          ? '<span style="color:var(--color-text-muted); font-size:0.8rem;">默认语言</span>'
          : `<button class="btn btn-sm btn-danger" data-delete-locale="${l.code}">删除</button>`}
      </td>
    </tr>
  `).join('');
}

function populateLocaleSelect() {
  localeSelect.innerHTML = locales
    .map((l) => `<option value="${l.code}" ${l.code === currentCode ? 'selected' : ''}>${escapeHtml(l.nativeName)} (${l.code})</option>`)
    .join('');
}

async function loadTranslationsForLocale(code) {
  currentCode = code;
  currentDict = await api(`/api/translations/${code}`);
  renderTranslationGroups();
}

function renderTranslationGroups() {
  translationGroups.innerHTML = KEY_GROUPS.map(([groupLabel, keys]) => `
    <div class="panel" style="background:var(--color-bg); box-shadow:none;">
      <h2 style="font-size:0.95rem;">${groupLabel}</h2>
      <div class="form-grid">
        ${keys.map((key) => `
          <div class="form-field">
            <label><code style="font-size:0.75rem; color:var(--color-text-muted);">${key}</code></label>
            <input type="text" data-i18n-key="${key}" value="${escapeHtml(currentDict[key] || '')}">
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

localeSelect.addEventListener('change', () => loadTranslationsForLocale(localeSelect.value));

document.getElementById('saveTranslationsBtn').addEventListener('click', async () => {
  const dict = {};
  document.querySelectorAll('[data-i18n-key]').forEach((input) => {
    dict[input.dataset.i18nKey] = input.value;
  });
  try {
    currentDict = await api(`/api/translations/${currentCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dict),
    });
    showToast('文案已保存');
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('exportJsonBtn').addEventListener('click', () => {
  document.getElementById('importJsonInput').value = JSON.stringify(currentDict, null, 2);
  showToast('已生成当前语言的 JSON，可复制或修改后重新导入');
});

document.getElementById('importJsonBtn').addEventListener('click', async () => {
  const raw = document.getElementById('importJsonInput').value.trim();
  if (!raw) return;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    showToast('JSON 格式有误，请检查');
    return;
  }
  try {
    currentDict = await api(`/api/translations/${currentCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });
    renderTranslationGroups();
    showToast('导入成功');
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('importJsonFileBtn').addEventListener('click', () => {
  document.getElementById('importJsonFile').click();
});

document.getElementById('importJsonFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  document.getElementById('importJsonInput').value = text;
  e.target.value = '';
});

localeRows.addEventListener('click', async (e) => {
  const code = e.target.dataset.deleteLocale;
  if (!code) return;
  if (!confirm(`确定要删除 ${code} 语言吗？该语言的所有翻译内容都会被删除。`)) return;
  try {
    await api(`/api/locales/${code}`, { method: 'DELETE' });
    showToast('语言已删除');
    loadLocales();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('addLanguageBtn').addEventListener('click', () => {
  languageForm.reset();
  languageModal.classList.add('open');
});
document.getElementById('languageCancelBtn').addEventListener('click', () => {
  languageModal.classList.remove('open');
});

languageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    code: document.getElementById('localeCode').value.trim().toLowerCase(),
    name: document.getElementById('localeName').value.trim(),
    nativeName: document.getElementById('localeNativeName').value.trim(),
  };
  try {
    await api('/api/locales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showToast('语言已添加');
    languageModal.classList.remove('open');
    currentCode = payload.code;
    loadLocales();
  } catch (err) {
    showToast(err.message);
  }
});

loadLocales();
