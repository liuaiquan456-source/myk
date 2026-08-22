const heroEyebrow = document.getElementById('heroEyebrow');
const heroHeading = document.getElementById('heroHeading');
const heroButtonText = document.getElementById('heroButtonText');
const heroImage = document.getElementById('heroImage');
const heroImagePreview = document.getElementById('heroImagePreview');
const heroImageUrl = document.getElementById('heroImageUrl');
const shopByCategoryEnabled = document.getElementById('shopByCategoryEnabled');
const contactWhatsapp = document.getElementById('contactWhatsapp');
const blocksList = document.getElementById('blocksList');

let layout = null;
let products = [];
let productsById = new Map();
let categories = [];
let pickerBlockIndex = null;
let pickerSelected = new Set();

// Categories can nest to any depth — walk the tree depth-first for the
// product picker's category filter, same pattern used on the products page.
function orderedCategories() {
  const byParent = new Map();
  categories.forEach((c) => {
    const key = c.parentId || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(c);
  });
  const ordered = [];
  const visited = new Set();
  function walk(parentId, depth) {
    (byParent.get(parentId) || []).forEach((cat) => {
      if (visited.has(cat.id)) return;
      visited.add(cat.id);
      ordered.push({ ...cat, depth });
      walk(cat.id, depth + 1);
    });
  }
  walk(null, 0);
  categories.forEach((c) => {
    if (!visited.has(c.id)) ordered.push({ ...c, depth: 0 });
  });
  return ordered;
}

// A category filter also matches products in that category's subcategories.
function categoryAndDescendantSlugs(slug) {
  const cat = categories.find((c) => c.slug === slug);
  if (!cat) return [slug];
  const slugs = [slug];
  function walk(parentId) {
    categories.filter((c) => c.parentId === parentId).forEach((c) => {
      slugs.push(c.slug);
      walk(c.id);
    });
  }
  walk(cat.id);
  return slugs;
}

async function loadLayout() {
  [layout, products, categories] = await Promise.all([api('/api/layout'), api('/api/products'), api('/api/categories')]);
  productsById = new Map(products.map((p) => [p.id, p]));

  const pickerCategoryField = document.getElementById('productPickerCategory');
  pickerCategoryField.innerHTML = '<option value="">全部分类</option>' +
    orderedCategories().map((c) => `<option value="${c.slug}">${c.depth > 0 ? '&nbsp;&nbsp;'.repeat(c.depth) + '&#8627; ' : ''}${escapeHtml(c.name)}</option>`).join('');

  heroEyebrow.value = layout.hero.eyebrow || '';
  heroHeading.value = layout.hero.heading || '';
  heroButtonText.value = layout.hero.buttonText || '';
  heroImageUrl.value = layout.hero.image || '';
  if (layout.hero.image) {
    heroImagePreview.src = layout.hero.image;
    heroImagePreview.style.display = 'block';
  }
  shopByCategoryEnabled.checked = !!layout.shopByCategoryEnabled;
  contactWhatsapp.value = layout.contactWhatsapp || '';
  renderBlocks();
}

function productChipHtml(blockIndex, productId, chipIndex, chipCount) {
  const p = productsById.get(productId);
  if (!p) return '';
  const cover = p.images && p.images[0];
  return `
    <div class="block-product-chip">
      ${cover ? `<img class="thumb" src="${cover}">` : '<div class="thumb"></div>'}
      <span class="block-product-chip-name">${escapeHtml(p.name)}</span>
      <button type="button" class="btn btn-sm btn-outline" data-move-product-up="${blockIndex}:${chipIndex}" ${chipIndex === 0 ? 'disabled' : ''}>&uarr;</button>
      <button type="button" class="btn btn-sm btn-outline" data-move-product-down="${blockIndex}:${chipIndex}" ${chipIndex === chipCount - 1 ? 'disabled' : ''}>&darr;</button>
      <button type="button" class="btn btn-sm btn-danger" data-remove-product="${blockIndex}:${chipIndex}">移除</button>
    </div>
  `;
}

function renderBlocks() {
  blocksList.innerHTML = '';
  layout.blocks.forEach((block, index) => {
    const productIds = block.productIds || [];
    const card = document.createElement('div');
    card.className = 'block-card';
    card.innerHTML = `
      <div class="block-card-header">
        <strong>板块 ${index + 1}</strong>
        <div class="block-order-btns">
          <button type="button" class="btn btn-sm btn-outline" data-move-up="${index}" ${index === 0 ? 'disabled' : ''}>&uarr;</button>
          <button type="button" class="btn btn-sm btn-outline" data-move-down="${index}" ${index === layout.blocks.length - 1 ? 'disabled' : ''}>&darr;</button>
          <button type="button" class="btn btn-sm btn-danger" data-remove-block="${index}">移除</button>
        </div>
      </div>
      <div class="form-grid">
        <div class="form-field full">
          <label>板块标题</label>
          <input type="text" data-field="title" data-index="${index}" value="${escapeHtml(block.title)}">
        </div>
        <div class="form-field full">
          <label>展示商品 <span style="font-weight:400; color:var(--color-text-muted);">（手动选择，按顺序展示在首页）</span></label>
          <div class="block-product-list" data-index="${index}">
            ${productIds.map((pid, i) => productChipHtml(index, pid, i, productIds.length)).join('') || '<p style="color:var(--color-text-muted); font-size:0.82rem;">还没有商品，点击下方按钮添加。</p>'}
          </div>
          <button type="button" class="btn btn-sm btn-outline" data-pick-products="${index}" style="margin-top:0.6rem;">+ 选择商品</button>
        </div>
        <div class="form-field full">
          <label><input type="checkbox" data-field="altBackground" data-index="${index}" ${block.altBackground ? 'checked' : ''}> 使用备用（灰底）背景</label>
        </div>
      </div>
    `;
    blocksList.appendChild(card);
  });
}

blocksList.addEventListener('input', (e) => {
  const index = Number(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (field === undefined || Number.isNaN(index)) return;

  if (field === 'altBackground') {
    layout.blocks[index].altBackground = e.target.checked;
  } else {
    layout.blocks[index][field] = e.target.value;
  }
});

blocksList.addEventListener('click', (e) => {
  const moveUp = e.target.dataset.moveUp;
  const moveDown = e.target.dataset.moveDown;
  const removeBlock = e.target.dataset.removeBlock;
  const pickProducts = e.target.dataset.pickProducts;
  const moveProductUp = e.target.dataset.moveProductUp;
  const moveProductDown = e.target.dataset.moveProductDown;
  const removeProduct = e.target.dataset.removeProduct;

  if (moveUp !== undefined) {
    const i = Number(moveUp);
    [layout.blocks[i - 1], layout.blocks[i]] = [layout.blocks[i], layout.blocks[i - 1]];
    renderBlocks();
  }
  if (moveDown !== undefined) {
    const i = Number(moveDown);
    [layout.blocks[i + 1], layout.blocks[i]] = [layout.blocks[i], layout.blocks[i + 1]];
    renderBlocks();
  }
  if (removeBlock !== undefined) {
    layout.blocks.splice(Number(removeBlock), 1);
    renderBlocks();
  }
  if (pickProducts !== undefined) {
    openProductPicker(Number(pickProducts));
  }
  if (moveProductUp !== undefined) {
    const [blockIndex, chipIndex] = moveProductUp.split(':').map(Number);
    const ids = layout.blocks[blockIndex].productIds;
    [ids[chipIndex - 1], ids[chipIndex]] = [ids[chipIndex], ids[chipIndex - 1]];
    renderBlocks();
  }
  if (moveProductDown !== undefined) {
    const [blockIndex, chipIndex] = moveProductDown.split(':').map(Number);
    const ids = layout.blocks[blockIndex].productIds;
    [ids[chipIndex + 1], ids[chipIndex]] = [ids[chipIndex], ids[chipIndex + 1]];
    renderBlocks();
  }
  if (removeProduct !== undefined) {
    const [blockIndex, chipIndex] = removeProduct.split(':').map(Number);
    layout.blocks[blockIndex].productIds.splice(chipIndex, 1);
    renderBlocks();
  }
});

document.getElementById('addBlockBtn').addEventListener('click', () => {
  layout.blocks.push({
    id: `block-${layout.blocks.length}-${Math.floor(Math.random() * 1e6)}`,
    title: '新板块',
    productIds: [],
    altBackground: false,
  });
  renderBlocks();
});

// ---------- Product picker modal ----------

const productPickerModal = document.getElementById('productPickerModal');
const productPickerList = document.getElementById('productPickerList');
const productPickerSearch = document.getElementById('productPickerSearch');
const productPickerCategory = document.getElementById('productPickerCategory');

function openProductPicker(blockIndex) {
  pickerBlockIndex = blockIndex;
  pickerSelected = new Set(layout.blocks[blockIndex].productIds || []);
  productPickerSearch.value = '';
  productPickerCategory.value = '';
  renderProductPickerList();
  productPickerModal.classList.add('open');
}

// Matches on product name or any of its SKU codes, so an admin who knows the
// internal SKU code can find a product without remembering its display name.
function productMatchesQuery(product, query) {
  if (product.name.toLowerCase().includes(query)) return true;
  return (product.skus || []).some((s) => (s.code || '').toLowerCase().includes(query));
}

function renderProductPickerList() {
  const query = productPickerSearch.value.trim().toLowerCase();
  const categorySlug = productPickerCategory.value;
  const allowedSlugs = categorySlug ? categoryAndDescendantSlugs(categorySlug) : null;

  const visible = products.filter((p) => {
    if (allowedSlugs && !allowedSlugs.includes(p.categorySlug)) return false;
    if (query && !productMatchesQuery(p, query)) return false;
    return true;
  });

  productPickerList.innerHTML = visible.map((p) => {
    const cover = p.images && p.images[0];
    const checked = pickerSelected.has(p.id);
    return `
      <label style="display:flex; align-items:center; gap:0.6rem; padding:0.35rem 0.2rem; cursor:pointer;">
        <input type="checkbox" data-pick-id="${p.id}" ${checked ? 'checked' : ''}>
        ${cover ? `<img class="thumb" src="${cover}">` : '<div class="thumb"></div>'}
        <span>${escapeHtml(p.name)}</span>
      </label>
    `;
  }).join('') || '<p style="color:var(--color-text-muted); font-size:0.85rem;">没有匹配的商品。</p>';
}

productPickerSearch.addEventListener('input', renderProductPickerList);
productPickerCategory.addEventListener('change', renderProductPickerList);

productPickerList.addEventListener('change', (e) => {
  const id = e.target.dataset.pickId;
  if (id === undefined) return;
  if (e.target.checked) pickerSelected.add(Number(id));
  else pickerSelected.delete(Number(id));
});

function closeProductPicker() {
  productPickerModal.classList.remove('open');
  pickerBlockIndex = null;
}

document.getElementById('productPickerClose').addEventListener('click', closeProductPicker);
document.getElementById('productPickerCancel').addEventListener('click', closeProductPicker);
productPickerModal.addEventListener('click', (e) => {
  if (e.target === productPickerModal) closeProductPicker();
});

document.getElementById('productPickerConfirm').addEventListener('click', () => {
  if (pickerBlockIndex === null) return;
  // Preserve the existing order for products that were already picked, then
  // append newly-checked ones at the end — arrow buttons handle fine-tuning.
  const existing = layout.blocks[pickerBlockIndex].productIds || [];
  const kept = existing.filter((id) => pickerSelected.has(id));
  const added = [...pickerSelected].filter((id) => !kept.includes(id));
  layout.blocks[pickerBlockIndex].productIds = [...kept, ...added];
  closeProductPicker();
  renderBlocks();
});

// ---------- Hero + save ----------

heroImage.addEventListener('change', async () => {
  if (!heroImage.files[0]) return;
  const formData = new FormData();
  formData.append('image', heroImage.files[0]);
  try {
    const { url } = await api('/api/upload', { method: 'POST', body: formData });
    heroImageUrl.value = url;
    heroImagePreview.src = url;
    heroImagePreview.style.display = 'block';
    showToast('图片已上传');
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('saveLayoutBtn').addEventListener('click', async () => {
  layout.hero.eyebrow = heroEyebrow.value;
  layout.hero.heading = heroHeading.value;
  layout.hero.buttonText = heroButtonText.value;
  layout.hero.image = heroImageUrl.value || null;
  layout.shopByCategoryEnabled = shopByCategoryEnabled.checked;
  layout.contactWhatsapp = contactWhatsapp.value.trim();

  try {
    await api('/api/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    });
    showToast('布局已保存');
  } catch (err) {
    showToast(err.message);
  }
});

loadLayout();
