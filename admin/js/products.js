const productRows = document.getElementById('productRows');
const productEmpty = document.getElementById('productEmpty');
const productModal = document.getElementById('productModal');
const productModalTitle = document.getElementById('productModalTitle');
const productForm = document.getElementById('productForm');
const productIdField = document.getElementById('productId');
const productNameField = document.getElementById('productName');
const productPriceField = document.getElementById('productPrice');
const productCategoryField = document.getElementById('productCategory');
const productBadgeField = document.getElementById('productBadge');
const productSizesField = document.getElementById('productSizes');
const productDescriptionField = document.getElementById('productDescription');
const productImageInput = document.getElementById('productImageInput');
const productImageGallery = document.getElementById('productImageGallery');
const categoryFilterField = document.getElementById('categoryFilter');
const skuListEl = document.getElementById('skuList');

const BADGE_LABELS = { sale: '促销', 'low-stock': '库存紧张', 'sold-out': '售罄' };
const COLLECTION_LABELS = {
  'gold-collection': '金色系列',
  'new-drops': '新品上架',
  'silver-collection': '银色系列',
  trending: '热门推荐',
  'new-in': 'New In',
};

let products = [];
let categories = [];
let currentImages = [];
let currentSkus = [];
let currentBundleIds = [];
let dragFromIndex = null;
let skuImageTargetIndex = null;
let bundlePickerSelected = new Set();

async function loadData() {
  [products, categories] = await Promise.all([api('/api/products'), api('/api/categories')]);
  populateCategorySelect();
  populateCategoryFilter();
  renderProducts();
}

// Categories can now nest to any depth — walk the tree depth-first so
// children (and grandchildren, etc.) always sort right under their parent.
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
  // Any orphaned category whose parent no longer exists still shows up at the end.
  categories.forEach((c) => {
    if (!visited.has(c.id)) ordered.push({ ...c, depth: 0 });
  });
  return ordered;
}

function populateCategorySelect() {
  productCategoryField.innerHTML = orderedCategories()
    .map((c) => `<option value="${c.slug}">${c.depth > 0 ? '&nbsp;&nbsp;'.repeat(c.depth) + '&#8627; ' : ''}${escapeHtml(c.name)}</option>`)
    .join('');
}

function populateCategoryFilter() {
  categoryFilterField.innerHTML =
    '<option value="">全部分类</option>' +
    orderedCategories()
      .map((c) => `<option value="${c.slug}">${c.depth > 0 ? '&nbsp;&nbsp;'.repeat(c.depth) + '&#8627; ' : ''}${escapeHtml(c.name)}</option>`)
      .join('');
}

// The top-level product.price field is just a fallback/default now that each
// SKU carries its own price — always display the cheapest variant's price.
function minSkuPrice(product) {
  const prices = (product.skus || []).map((s) => Number(s.price)).filter((n) => !Number.isNaN(n));
  return prices.length ? Math.min(...prices) : Number(product.price);
}

function categoryName(slug) {
  const cat = categories.find((c) => c.slug === slug);
  return cat ? cat.name : slug;
}

// A category filter also matches products in that category's subcategories,
// at any depth (a grandchild category still counts as a descendant).
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

function renderProducts() {
  const filterSlug = categoryFilterField.value;
  const visibleProducts = filterSlug
    ? products.filter((p) => categoryAndDescendantSlugs(filterSlug).includes(p.categorySlug))
    : products;

  productRows.innerHTML = '';
  productEmpty.style.display = visibleProducts.length ? 'none' : 'block';

  visibleProducts.forEach((p) => {
    const cover = p.images && p.images[0];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${cover ? `<img class="thumb" src="${cover}">` : `<div class="thumb"></div>`}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(categoryName(p.categorySlug))}</td>
      <td>$${minSkuPrice(p).toFixed(2)}</td>
      <td>${(p.skus || []).length}</td>
      <td>${(p.bundleProductIds || []).length ? `<span class="tag-pill tag-pill-new">组合 ×${p.bundleProductIds.length}</span>` : '&mdash;'}</td>
      <td>${(p.skus || []).reduce((sum, s) => sum + (s.stock ?? 0), 0)}${(p.skus || []).some((s) => (s.stock ?? 0) <= 0) ? ' <span class="tag-pill tag-pill-warning">部分缺货</span>' : ''}</td>
      <td>${p.badge ? `<span class="tag-pill">${BADGE_LABELS[p.badge] || p.badge}</span>` : ''}</td>
      <td class="row-actions">
        <button class="btn btn-sm btn-outline" data-edit="${p.id}">编辑</button>
        <button class="btn btn-sm btn-danger" data-delete="${p.id}">删除</button>
      </td>
    `;
    productRows.appendChild(tr);
  });
}

function renderImageGallery() {
  productImageGallery.innerHTML = currentImages
    .map(
      (url, index) => `
      <div class="gallery-item" draggable="true" data-index="${index}">
        <img src="${url}" alt="">
        ${index === 0 ? '<span class="cover-label">封面</span>' : ''}
        <button type="button" class="remove-btn" data-remove-image="${index}" aria-label="移除图片">&times;</button>
      </div>
    `
    )
    .join('');
}

productImageGallery.addEventListener('click', (e) => {
  const removeIndex = e.target.dataset.removeImage;
  if (removeIndex !== undefined) {
    currentImages.splice(Number(removeIndex), 1);
    renderImageGallery();
    return;
  }
  // The <img> itself has pointer-events:none (so drag-to-reorder can grab the
  // whole tile), so a click here lands on .gallery-item, not the image.
  const item = e.target.closest('.gallery-item');
  if (item) openImageLightbox(item.querySelector('img').src);
});

productImageGallery.addEventListener('dragstart', (e) => {
  const item = e.target.closest('.gallery-item');
  if (!item) return;
  dragFromIndex = Number(item.dataset.index);
  item.classList.add('dragging');
});

productImageGallery.addEventListener('dragend', (e) => {
  const item = e.target.closest('.gallery-item');
  if (item) item.classList.remove('dragging');
  productImageGallery.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
});

productImageGallery.addEventListener('dragover', (e) => {
  e.preventDefault();
  const item = e.target.closest('.gallery-item');
  if (!item) return;
  productImageGallery.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
  item.classList.add('drag-over');
});

productImageGallery.addEventListener('drop', (e) => {
  e.preventDefault();
  const item = e.target.closest('.gallery-item');
  if (!item || dragFromIndex === null) return;
  const dropIndex = Number(item.dataset.index);
  const [moved] = currentImages.splice(dragFromIndex, 1);
  currentImages.splice(dropIndex, 0, moved);
  dragFromIndex = null;
  renderImageGallery();
});

productImageInput.addEventListener('change', async () => {
  const files = [...productImageInput.files];
  for (const file of files) {
    const formData = new FormData();
    formData.append('image', file);
    try {
      const { url } = await api('/api/upload', { method: 'POST', body: formData });
      currentImages.push(url);
      renderImageGallery();
    } catch (err) {
      showToast(err.message);
    }
  }
  productImageInput.value = '';
});

// ---------- SKU variants ----------

function renderSkuRows() {
  if (!currentSkus.length) {
    skuListEl.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.82rem; margin-bottom:0.6rem;">还没有变体，点击下方按钮添加（例如 Gold / Silver / 玫瑰金，各自独立定价）。</p>';
    return;
  }
  skuListEl.innerHTML = currentSkus.map((sku, index) => `
    <div class="sku-row" data-index="${index}">
      <img class="sku-row-thumb" src="${sku.image || ''}" data-sku-thumb="${index}" title="点击选择该变体的图片" style="${sku.image ? '' : 'background:linear-gradient(160deg,#f1e2b8,var(--color-gold));'}">
      <div class="sku-row-fields">
        <div class="sku-field">
          <label>变体名称</label>
          <input type="text" data-sku-field="color" data-index="${index}" value="${escapeHtml(sku.color || '')}" placeholder="如 Gold" list="skuColorSuggestions">
        </div>
        <div class="sku-field">
          <label>SKU 编码（选填）</label>
          <input type="text" data-sku-field="code" data-index="${index}" value="${escapeHtml(sku.code || '')}" placeholder="选填">
        </div>
        <div class="sku-field">
          <label>价格</label>
          <input type="number" step="0.01" min="0" data-sku-field="price" data-index="${index}" value="${sku.price ?? ''}" placeholder="价格">
        </div>
        <div class="sku-field">
          <label>库存</label>
          <input type="number" min="0" step="1" data-sku-field="stock" data-index="${index}" value="${sku.stock ?? 0}">
        </div>
        <div class="sku-field">
          <label>起订量 <span style="font-weight:400; color:var(--color-text-muted);">（前台加购每次的数量）</span></label>
          <input type="number" min="1" step="1" data-sku-field="moq" data-index="${index}" value="${sku.moq ?? 1}">
        </div>
      </div>
      <button type="button" class="btn btn-sm btn-danger sku-row-remove" data-remove-sku="${index}">删除</button>
    </div>
  `).join('');
}

document.getElementById('addSkuBtn').addEventListener('click', () => {
  currentSkus.push({
    id: null,
    code: '',
    color: currentSkus.some((s) => s.color === 'gold') ? 'silver' : 'gold',
    price: productPriceField.value || '',
    stock: 0,
    moq: 1,
    image: null,
  });
  renderSkuRows();
});

skuListEl.addEventListener('input', (e) => {
  const index = Number(e.target.dataset.index);
  const field = e.target.dataset.skuField;
  if (Number.isNaN(index) || !field) return;
  currentSkus[index][field] = e.target.value;
});

skuListEl.addEventListener('click', (e) => {
  const removeIndex = e.target.dataset.removeSku;
  if (removeIndex !== undefined) {
    currentSkus.splice(Number(removeIndex), 1);
    renderSkuRows();
    return;
  }
  const thumbIndex = e.target.dataset.skuThumb;
  if (thumbIndex !== undefined) {
    openSkuImagePicker(Number(thumbIndex));
  }
});

// ---------- SKU image picker (choose from the product's uploaded gallery, or upload new) ----------

const skuImagePickerModal = document.getElementById('skuImagePickerModal');
const skuImagePickerGallery = document.getElementById('skuImagePickerGallery');

const skuImageInput = document.createElement('input');
skuImageInput.type = 'file';
skuImageInput.accept = 'image/*';
skuImageInput.style.display = 'none';
document.body.appendChild(skuImageInput);

function openSkuImagePicker(index) {
  skuImageTargetIndex = index;
  skuImagePickerGallery.innerHTML = currentImages.length
    ? currentImages.map((url) => `<div class="gallery-item" data-pick-image="${url}"><img src="${url}" alt=""></div>`).join('')
    : '<p style="color:var(--color-text-muted); font-size:0.85rem;">该商品还没有上传任何图片，请先在上方"商品图片"区上传，或点击下方直接上传一张。</p>';
  skuImagePickerModal.classList.add('open');
}

skuImagePickerGallery.addEventListener('click', (e) => {
  const url = e.target.closest('[data-pick-image]')?.dataset.pickImage;
  if (!url || skuImageTargetIndex === null) return;
  currentSkus[skuImageTargetIndex].image = url;
  renderSkuRows();
  skuImagePickerModal.classList.remove('open');
  skuImageTargetIndex = null;
});

document.getElementById('skuImagePickerCancelBtn').addEventListener('click', () => {
  skuImagePickerModal.classList.remove('open');
  skuImageTargetIndex = null;
});

document.getElementById('skuImageUploadNewBtn').addEventListener('click', () => {
  skuImageInput.click();
});

skuImageInput.addEventListener('change', async () => {
  const file = skuImageInput.files[0];
  if (!file || skuImageTargetIndex === null) return;
  const formData = new FormData();
  formData.append('image', file);
  try {
    const { url } = await api('/api/upload', { method: 'POST', body: formData });
    currentSkus[skuImageTargetIndex].image = url;
    renderSkuRows();
    skuImagePickerModal.classList.remove('open');
  } catch (err) {
    showToast(err.message);
  }
  skuImageInput.value = '';
  skuImageTargetIndex = null;
});

function openProductModal(product) {
  productForm.reset();
  currentImages = [];
  currentSkus = [];
  currentBundleIds = [];
  document.querySelectorAll('.productCollection').forEach((cb) => (cb.checked = false));

  if (product) {
    productModalTitle.textContent = '编辑商品';
    productIdField.value = product.id;
    productNameField.value = product.name;
    productPriceField.value = minSkuPrice(product);
    productCategoryField.value = product.categorySlug;
    productBadgeField.value = product.badge || 'none';
    productSizesField.value = (product.sizes || []).join(', ');
    productDescriptionField.value = product.description || '';
    (product.collections || []).forEach((collection) => {
      const cb = document.querySelector(`.productCollection[value="${collection}"]`);
      if (cb) cb.checked = true;
    });
    currentImages = [...(product.images || [])];
    currentSkus = product.skus && product.skus.length
      ? product.skus.map((s) => ({ ...s }))
      : (product.colors || []).map((color) => ({ id: null, color, price: product.price, stock: 0, moq: 1, image: null }));
    currentBundleIds = [...(product.bundleProductIds || [])];
  } else {
    productModalTitle.textContent = '添加商品';
    productIdField.value = '';
  }
  renderImageGallery();
  renderSkuRows();
  renderBundleProductList();
  productModal.classList.add('open');
}

function closeProductModal() {
  productModal.classList.remove('open');
}

document.getElementById('addProductBtn').addEventListener('click', () => openProductModal(null));
document.getElementById('productCancelBtn').addEventListener('click', closeProductModal);
document.getElementById('productModalClose').addEventListener('click', closeProductModal);

productRows.addEventListener('click', async (e) => {
  if (e.target.matches('img.thumb')) {
    openImageLightbox(e.target.src);
    return;
  }

  const editId = e.target.dataset.edit;
  const deleteId = e.target.dataset.delete;

  if (editId) {
    const product = products.find((p) => p.id === Number(editId));
    openProductModal(product);
  }

  if (deleteId) {
    if (!confirm('确定要删除该商品吗？')) return;
    try {
      await api(`/api/products/${deleteId}`, { method: 'DELETE' });
      showToast('商品已删除');
      loadData();
    } catch (err) {
      showToast(err.message);
    }
  }
});

productForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const collections = [...document.querySelectorAll('.productCollection:checked')].map((cb) => cb.value);

  const payload = {
    name: productNameField.value.trim(),
    price: Number(productPriceField.value),
    categorySlug: productCategoryField.value,
    badge: productBadgeField.value,
    collections,
    images: currentImages,
    skus: currentSkus,
    sizes: productSizesField.value,
    description: productDescriptionField.value.trim(),
    bundleProductIds: currentBundleIds,
  };

  const id = productIdField.value;
  try {
    if (id) {
      await api(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showToast('商品已更新');
    } else {
      await api('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showToast('商品已创建');
    }
    closeProductModal();
    loadData();
  } catch (err) {
    showToast(err.message);
  }
});

categoryFilterField.addEventListener('change', renderProducts);

// ---------- Image lightbox ----------

const imageLightbox = document.getElementById('imageLightbox');
const imageLightboxImg = document.getElementById('imageLightboxImg');

function openImageLightbox(src) {
  imageLightboxImg.src = src;
  imageLightbox.classList.add('open');
}

function closeImageLightbox() {
  imageLightbox.classList.remove('open');
  imageLightboxImg.src = '';
}

document.getElementById('imageLightboxClose').addEventListener('click', closeImageLightbox);
imageLightbox.addEventListener('click', (e) => {
  if (e.target === imageLightbox) closeImageLightbox();
});

// ---------- Frequently-bought-together bundle picker ----------

const bundleProductList = document.getElementById('bundleProductList');
const bundlePickerModal = document.getElementById('bundlePickerModal');
const bundlePickerList = document.getElementById('bundlePickerList');
const bundlePickerSearch = document.getElementById('bundlePickerSearch');
const bundlePickerCategory = document.getElementById('bundlePickerCategory');

function renderBundleProductList() {
  bundleProductList.innerHTML = currentBundleIds.map((pid, i) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return '';
    const cover = p.images && p.images[0];
    return `
      <div class="block-product-chip">
        ${cover ? `<img class="thumb" src="${cover}">` : '<div class="thumb"></div>'}
        <span class="block-product-chip-name">${escapeHtml(p.name)}</span>
        <button type="button" class="btn btn-sm btn-danger" data-remove-bundle="${i}">移除</button>
      </div>
    `;
  }).join('') || '<p style="color:var(--color-text-muted); font-size:0.82rem;">还没有搭配商品。</p>';
}

bundleProductList.addEventListener('click', (e) => {
  const removeIndex = e.target.dataset.removeBundle;
  if (removeIndex === undefined) return;
  currentBundleIds.splice(Number(removeIndex), 1);
  renderBundleProductList();
});

document.getElementById('pickBundleProductsBtn').addEventListener('click', () => {
  bundlePickerSelected = new Set(currentBundleIds);
  bundlePickerSearch.value = '';
  bundlePickerCategory.innerHTML = '<option value="">全部分类</option>' +
    orderedCategories().map((c) => `<option value="${c.slug}">${c.depth > 0 ? '&nbsp;&nbsp;'.repeat(c.depth) + '&#8627; ' : ''}${escapeHtml(c.name)}</option>`).join('');
  bundlePickerCategory.value = '';
  renderBundlePickerList();
  bundlePickerModal.classList.add('open');
});

function bundleProductMatchesQuery(product, query) {
  if (product.name.toLowerCase().includes(query)) return true;
  return (product.skus || []).some((s) => (s.code || '').toLowerCase().includes(query));
}

function renderBundlePickerList() {
  const query = bundlePickerSearch.value.trim().toLowerCase();
  const categorySlug = bundlePickerCategory.value;
  const allowedSlugs = categorySlug ? categoryAndDescendantSlugs(categorySlug) : null;
  const excludeId = Number(productIdField.value) || null;

  const visible = products.filter((p) => {
    if (p.id === excludeId) return false; // a product can't bundle with itself
    if (allowedSlugs && !allowedSlugs.includes(p.categorySlug)) return false;
    if (query && !bundleProductMatchesQuery(p, query)) return false;
    return true;
  });

  bundlePickerList.innerHTML = visible.map((p) => {
    const cover = p.images && p.images[0];
    const checked = bundlePickerSelected.has(p.id);
    return `
      <label style="display:flex; align-items:center; gap:0.6rem; padding:0.35rem 0.2rem; cursor:pointer;">
        <input type="checkbox" data-pick-id="${p.id}" ${checked ? 'checked' : ''}>
        ${cover ? `<img class="thumb" src="${cover}">` : '<div class="thumb"></div>'}
        <span>${escapeHtml(p.name)}</span>
      </label>
    `;
  }).join('') || '<p style="color:var(--color-text-muted); font-size:0.85rem;">没有匹配的商品。</p>';
}

bundlePickerSearch.addEventListener('input', renderBundlePickerList);
bundlePickerCategory.addEventListener('change', renderBundlePickerList);

bundlePickerList.addEventListener('change', (e) => {
  const id = e.target.dataset.pickId;
  if (id === undefined) return;
  if (e.target.checked) bundlePickerSelected.add(Number(id));
  else bundlePickerSelected.delete(Number(id));
});

function closeBundlePicker() {
  bundlePickerModal.classList.remove('open');
}

document.getElementById('bundlePickerClose').addEventListener('click', closeBundlePicker);
document.getElementById('bundlePickerCancel').addEventListener('click', closeBundlePicker);
bundlePickerModal.addEventListener('click', (e) => {
  if (e.target === bundlePickerModal) closeBundlePicker();
});

document.getElementById('bundlePickerConfirm').addEventListener('click', () => {
  const kept = currentBundleIds.filter((id) => bundlePickerSelected.has(id));
  const added = [...bundlePickerSelected].filter((id) => !kept.includes(id));
  currentBundleIds = [...kept, ...added];
  closeBundlePicker();
  renderBundleProductList();
});

loadData();
