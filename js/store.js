function escapeHtmlLocal(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

function colorsToPlaceholder(colors) {
  if (!colors || colors.length === 0) return 'placeholder-gold';
  if (colors.length > 1) return 'placeholder-mixed';
  return colors[0] === 'silver' ? 'placeholder-silver' : 'placeholder-gold';
}

// Variant names are free text now (not limited to gold/silver), so fall back
// to a neutral gradient for anything that isn't a recognized metal color.
function variantPlaceholderClass(color) {
  const normalized = (color || '').trim().toLowerCase();
  if (normalized === 'gold') return 'placeholder-gold';
  if (normalized === 'silver') return 'placeholder-silver';
  return 'placeholder-mixed';
}

const BADGE_LABELS = { sale: 'Sale', 'low-stock': 'Low Stock', 'sold-out': 'Sold Out' };

// Each SKU carries its own price now — show the cheapest variant's price by default.
function minSkuPrice(product) {
  const prices = (product.skus || []).map((s) => Number(s.price)).filter((n) => !Number.isNaN(n));
  return prices.length ? Math.min(...prices) : Number(product.price);
}

// Inline onload/onerror (rather than wiring listeners after insertion) keep
// this working no matter how the returned HTML string gets injected — and
// they still fire for cached images, so there's no stuck shimmer.
const IMG_LOADING_ATTRS = `onload="this.classList.remove('img-loading')" onerror="this.classList.remove('img-loading')"`;

// Elements that show a photo via CSS background-image (the PDP gallery, the
// hero banner) have no native load event to hook into like <img> does, so we
// preload off-DOM and only swap the real background in once it's ready —
// the .img-loading shimmer covers the wait.
function setBackgroundImageWhenLoaded(el, url, prefix = '', showShimmer = true) {
  if (!el || !url) return;
  if (showShimmer) el.classList.add('img-loading');
  const preload = new Image();
  preload.onload = () => {
    el.style.backgroundImage = `${prefix}url('${url}')`;
    el.classList.remove('img-loading');
  };
  preload.onerror = () => el.classList.remove('img-loading');
  preload.src = url;
}

function renderProductImage(product) {
  const badgeClass = product.badge === 'sale' ? 'badge-sale' : 'badge-stock';
  const badgeHtml = product.badge ? `<span class="badge ${badgeClass}">${BADGE_LABELS[product.badge] || product.badge}</span>` : '';
  const images = product.images || [];

  if (images[0]) {
    const altPhoto = images[1]
      ? `<img class="product-image-alt-photo img-loading" src="${images[1]}" alt="" ${IMG_LOADING_ATTRS}>`
      : '';
    return `<div class="product-image"><img class="product-image-photo img-loading" src="${images[0]}" alt="${escapeHtmlLocal(product.name)}" ${IMG_LOADING_ATTRS}>${altPhoto}${badgeHtml}</div>`;
  }
  return `<div class="product-image ${colorsToPlaceholder(product.colors)}">${badgeHtml}</div>`;
}

function renderProductCard(product) {
  return `
    <div class="product-card" data-product-id="${product.id}">
      ${renderProductImage(product)}
      <p class="product-name">${escapeHtmlLocal(product.name)}</p>
      <p class="product-price">$${minSkuPrice(product).toFixed(2)}</p>
    </div>
  `;
}

function renderListingProductCard(product) {
  const soldOut = product.badge === 'sold-out';
  const actionKey = soldOut ? 'listing.notifyMe' : 'listing.addToBag';
  const actionText = soldOut ? 'Notify Me' : '+ Add to Bag';
  const actionAttr = soldOut ? '' : `data-quick-add="${product.id}"`;
  const swatches = (product.colors || [])
    .map((c) => `<span class="swatch placeholder-${c === 'silver' ? 'silver' : 'gold'}"></span>`)
    .join('');
  return `
    <div class="product-card" data-product-id="${product.id}">
      ${renderProductImage(product)}
      <p class="product-action" data-i18n="${actionKey}" ${actionAttr}>${actionText}</p>
      <p class="product-name">${escapeHtmlLocal(product.name)}</p>
      <p class="product-price">$${minSkuPrice(product).toFixed(2)}</p>
      <div class="color-swatches">${swatches}</div>
    </div>
  `;
}

document.addEventListener(
  'click',
  (e) => {
    const quickAddId = e.target.dataset.quickAdd;
    if (!quickAddId) return;
    e.preventDefault();
    e.stopPropagation();
    addToCart(Number(quickAddId), 1);
    if (window.openCartDrawer) window.openCartDrawer();
  },
  true
);

function renderCategoryBlockSection(block, products) {
  if (!products.length) return '';
  return `
    <section class="category-block ${block.altBackground ? 'alt-bg' : ''}">
      <div class="category-header">
        <h2>${escapeHtmlLocal(block.title)}</h2>
        <a href="new-in.html" class="link-more">View All &rarr;</a>
      </div>
      <div class="product-grid">
        ${products.map(renderProductCard).join('')}
      </div>
    </section>
  `;
}

// ---------- Homepage ----------

async function renderHomepage() {
  const [layout, categories, allProducts] = await Promise.all([
    fetchJSON('/api/layout'),
    fetchJSON('/api/categories'),
    fetchJSON('/api/products'),
  ]);
  const productsById = new Map(allProducts.map((p) => [p.id, p]));

  document.getElementById('heroEyebrow').textContent = layout.hero.eyebrow || '';
  document.getElementById('heroHeading').textContent = layout.hero.heading || '';
  document.getElementById('heroButton').textContent = layout.hero.buttonText || 'Shop Now';

  if (layout.hero.image) {
    const heroEl = document.getElementById('heroFull');
    const overlay = 'linear-gradient(0deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.05) 45%, rgba(0, 0, 0, 0.15) 100%)';
    heroEl.style.backgroundSize = 'cover';
    heroEl.style.backgroundPosition = 'center';
    // Overlay shows immediately (no network needed for a gradient) so the
    // section never looks blank; the photo itself fades in once loaded.
    // No shimmer here — a beige shimmer would fight the white hero text.
    heroEl.style.backgroundImage = overlay;
    setBackgroundImageWhenLoaded(heroEl, layout.hero.image, `${overlay}, `, false);
  }

  const shopSection = document.getElementById('shopByCategorySection');
  const topLevelCategories = categories.filter((c) => !c.parentId);
  if (layout.shopByCategoryEnabled && topLevelCategories.length) {
    const placeholderCycle = ['placeholder-gold', 'placeholder-mixed', 'placeholder-silver', 'placeholder-gold'];
    document.getElementById('shopByGrid').innerHTML = topLevelCategories.map((cat, i) => `
      <a href="new-in.html?category=${encodeURIComponent(cat.slug)}" class="shop-by-item">
        <div class="shop-by-image ${cat.image ? '' : placeholderCycle[i % placeholderCycle.length]}">
          ${cat.image ? `<img class="shop-by-image-photo img-loading" src="${cat.image}" alt="${escapeHtmlLocal(cat.name)}" ${IMG_LOADING_ATTRS}>` : ''}
        </div>
        <p>${escapeHtmlLocal(cat.name)}</p>
      </a>
    `).join('');
  } else {
    shopSection.style.display = 'none';
  }

  // Each block's products are hand-picked by the admin (block.productIds), in
  // the order they chose — no more auto-population from a collection tag.
  const container = document.getElementById('categoryBlocksContainer');
  const blockSections = layout.blocks.map((block) => {
    const products = (block.productIds || []).map((id) => productsById.get(id)).filter(Boolean);
    return renderCategoryBlockSection(block, products);
  });
  container.innerHTML = blockSections.join('');

  enhanceProductCards(container);
  if (window.reapplyI18n) window.reapplyI18n();
}

// ---------- New In / category listing ----------

const BADGE_FILTER_LABELS = { sale: 'Sale', 'low-stock': 'Low Stock', 'sold-out': 'Sold Out' };

async function renderNewIn() {
  const grid = document.getElementById('newInGrid');
  const heading = document.getElementById('pageHeading');
  const params = new URLSearchParams(window.location.search);
  const categorySlug = params.get('category');
  const searchQuery = params.get('search');

  let products;
  if (searchQuery) {
    const all = await fetchJSON('/api/products');
    const q = searchQuery.trim().toLowerCase();
    products = all.filter((p) => p.name.toLowerCase().includes(q) || (p.skus || []).some((s) => (s.code || '').toLowerCase().includes(q)));
    // Drop data-i18n so the reapplyI18n() call below doesn't stomp this custom heading.
    if (heading) { heading.removeAttribute('data-i18n'); heading.textContent = `Search results for "${searchQuery}"`; }
  } else if (categorySlug) {
    const categories = await fetchJSON('/api/categories');
    const category = categories.find((c) => c.slug === categorySlug);
    if (heading) { heading.removeAttribute('data-i18n'); heading.textContent = category ? category.name : 'Products'; }
    products = await fetchJSON(`/api/products?category=${encodeURIComponent(categorySlug)}`);
  } else {
    // No category/search filter — New In is just every product, newest first
    // (the API already sorts by id desc, i.e. upload order).
    products = await fetchJSON('/api/products');
  }

  // Tag filter — flat buttons for whichever badges actually appear in this
  // result set, so a filter is never offered with nothing behind it.
  const tagFilterBar = document.getElementById('tagFilterBar');
  let activeTag = '';
  const badgesPresent = [...new Set(products.map((p) => p.badge).filter(Boolean))];

  function renderGrid() {
    const filtered = activeTag ? products.filter((p) => p.badge === activeTag) : products;
    grid.innerHTML = filtered.length
      ? filtered.map(renderListingProductCard).join('')
      : '<p style="grid-column: 1 / -1; color: var(--color-text-muted);">No products found.</p>';
    enhanceProductCards(grid);
    if (window.reapplyI18n) window.reapplyI18n();
  }

  if (tagFilterBar) {
    if (badgesPresent.length) {
      tagFilterBar.innerHTML = `<button type="button" class="tag-filter-btn active" data-tag="">All</button>` +
        badgesPresent.map((b) => `<button type="button" class="tag-filter-btn" data-tag="${b}">${BADGE_FILTER_LABELS[b] || b}</button>`).join('');
      tagFilterBar.style.display = '';
      tagFilterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.tag-filter-btn');
        if (!btn) return;
        tagFilterBar.querySelectorAll('.tag-filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeTag = btn.dataset.tag;
        renderGrid();
      });
    } else {
      tagFilterBar.style.display = 'none';
    }
  }

  renderGrid();
}

// ---------- Wishlist page ----------

async function renderWishlistPage() {
  const grid = document.getElementById('wishlistGrid');
  const emptyState = document.getElementById('wishlistEmpty');
  const ids = getWishlist();

  if (!ids.length) {
    grid.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  const allProducts = await fetchJSON('/api/products');
  const products = ids.map((id) => allProducts.find((p) => p.id === id)).filter(Boolean);

  if (!products.length) {
    grid.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  grid.style.display = '';
  emptyState.style.display = 'none';
  grid.innerHTML = products.map(renderListingProductCard).join('');
  enhanceProductCards(grid);
  if (window.reapplyI18n) window.reapplyI18n();
}

// ---------- Product detail page ----------

// "Frequently Bought Together" — admin-curated list of other products shown
// alongside this one, each with its own independent variant picker (not tied
// to the main swatch/size selectors above) and a bulk add-to-bag.
function renderBundleSection(product, allProducts) {
  const bundleSection = document.getElementById('pdpBundle');
  const bundleIds = product.bundleProductIds || [];
  const bundleProducts = bundleIds.map((id) => allProducts.find((p) => p.id === id)).filter(Boolean);
  if (!bundleProducts.length) {
    bundleSection.style.display = 'none';
    return;
  }
  bundleSection.style.display = '';

  const items = [product, ...bundleProducts];

  const bundleImageUrls = items.map((p) => (p.images && p.images[0]) || (p.skus && p.skus[0] && p.skus[0].image) || '');
  document.getElementById('pdpBundleImages').innerHTML = items.map((p, i) => {
    return `${i > 0 ? '<span class="pdp-bundle-plus">+</span>' : ''}<div class="pdp-bundle-image" data-bundle-image-index="${i}"></div>`;
  }).join('');
  document.querySelectorAll('#pdpBundleImages [data-bundle-image-index]').forEach((el) => {
    setBackgroundImageWhenLoaded(el, bundleImageUrls[Number(el.dataset.bundleImageIndex)]);
  });

  document.getElementById('pdpBundleList').innerHTML = items.map((p, i) => {
    const skus = (p.skus && p.skus.length) ? p.skus : [{ id: null, color: '', price: p.price }];
    const label = i === 0 ? `This Item: ${escapeHtmlLocal(p.name)}` : escapeHtmlLocal(p.name);
    const showVariant = skus.length > 1 || skus[0].color;
    return `
      <div class="pdp-bundle-item" data-product-id="${p.id}">
        <input type="checkbox" data-bundle-check checked>
        <span class="pdp-bundle-item-name">${label}</span>
        ${showVariant ? `<select class="pdp-bundle-item-variant" data-bundle-variant>${skus.map((s) => `<option value="${s.id || ''}" data-price="${s.price}">${escapeHtmlLocal(s.color || 'Default')}</option>`).join('')}</select>` : ''}
        <span class="pdp-bundle-item-price" data-bundle-price>$${Number(skus[0].price).toFixed(2)}</span>
      </div>
    `;
  }).join('');

  function recomputeBundleTotal() {
    let total = 0;
    document.querySelectorAll('#pdpBundleList .pdp-bundle-item').forEach((row) => {
      if (!row.querySelector('[data-bundle-check]').checked) return;
      total += Number(row.querySelector('[data-bundle-price]').textContent.replace('$', '')) || 0;
    });
    document.getElementById('pdpBundleTotal').textContent = `$${total.toFixed(2)}`;
  }

  document.getElementById('pdpBundleList').addEventListener('change', (e) => {
    if (e.target.matches('[data-bundle-variant]')) {
      const price = Number(e.target.selectedOptions[0].dataset.price) || 0;
      e.target.closest('.pdp-bundle-item').querySelector('[data-bundle-price]').textContent = `$${price.toFixed(2)}`;
    }
    recomputeBundleTotal();
  });
  recomputeBundleTotal();

  document.getElementById('pdpBundleAddBtn').addEventListener('click', () => {
    let added = 0;
    document.querySelectorAll('#pdpBundleList .pdp-bundle-item').forEach((row) => {
      if (!row.querySelector('[data-bundle-check]').checked) return;
      const variantSelect = row.querySelector('[data-bundle-variant]');
      addToCart(Number(row.dataset.productId), 1, variantSelect ? (variantSelect.value || null) : null);
      added++;
    });
    if (added && window.openCartDrawer) window.openCartDrawer();
  });
}

async function renderProductDetail() {
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get('id');

  const [products, categories] = await Promise.all([
    fetchJSON('/api/products'),
    fetchJSON('/api/categories'),
  ]);
  if (!products.length) return;

  const product = (requestedId && products.find((p) => p.id === Number(requestedId))) || products[0];
  const category = categories.find((c) => c.slug === product.categorySlug);

  document.title = `${product.name} | MYK`;
  if (typeof addToRecentlyViewed === 'function') addToRecentlyViewed(product.id);

  const addBtn = document.querySelector('.pdp-add-btn');
  if (addBtn) addBtn.dataset.productId = product.id;

  const wishlistBtn = document.querySelector('.pdp-wishlist');
  if (wishlistBtn) {
    wishlistBtn.dataset.productId = product.id;
    wishlistBtn.classList.toggle('active', typeof isInWishlist === 'function' && isInWishlist(product.id));
  }

  const breadcrumbCategory = document.getElementById('breadcrumbCategory');
  breadcrumbCategory.textContent = category ? category.name : product.categorySlug;
  breadcrumbCategory.href = category ? `new-in.html?category=${encodeURIComponent(category.slug)}` : '#';
  document.getElementById('breadcrumbName').textContent = product.name;

  document.getElementById('pdpTitle').textContent = product.name;

  const pdpMaterial = document.getElementById('pdpMaterial');
  if (product.material) {
    pdpMaterial.textContent = product.material;
    pdpMaterial.style.display = '';
  } else {
    pdpMaterial.style.display = 'none';
  }

  document.getElementById('pdpPriceValue').textContent = `$${Number(product.price).toFixed(2)}`;

  const pdpCode = document.getElementById('pdpCode');
  if (product.code) {
    pdpCode.textContent = `Item No. ${product.code}`;
    pdpCode.style.display = '';
  } else {
    pdpCode.style.display = 'none';
  }

  // Size variants — admin-defined per product; hide the selector entirely
  // when a product doesn't have any (most jewelry doesn't need one).
  const sizeOptionGroup = document.getElementById('sizeOptionGroup');
  const sizes = product.sizes || [];
  if (sizes.length) {
    sizeOptionGroup.style.display = '';
    document.getElementById('sizeOptions').innerHTML = sizes
      .map((size, i) => `<button class="pdp-size-btn ${i === 0 ? 'active' : ''}">${escapeHtmlLocal(size)}</button>`)
      .join('');
  } else {
    sizeOptionGroup.style.display = 'none';
  }

  // Product description — hide the "Details & Materials" accordion item
  // entirely when the admin hasn't written one, rather than showing stale
  // boilerplate that doesn't match the product.
  const detailsItem = document.getElementById('detailsAccordionItem');
  if (product.description) {
    detailsItem.style.display = '';
    document.getElementById('pdpDescription').textContent = product.description;
  } else {
    detailsItem.style.display = 'none';
  }

  // Gallery
  const images = product.images || [];
  const pdpMainImage = document.getElementById('pdpMainImage');
  const pdpThumbs = document.getElementById('pdpThumbs');

  if (images.length) {
    pdpMainImage.className = 'pdp-main-image';
    setBackgroundImageWhenLoaded(pdpMainImage, images[0]);
    pdpThumbs.innerHTML = images
      .map((url, i) => `<button class="pdp-thumb ${i === 0 ? 'active' : ''}" data-photo="${url}"></button>`)
      .join('');
    pdpThumbs.querySelectorAll('.pdp-thumb').forEach((btn) => {
      setBackgroundImageWhenLoaded(btn, btn.dataset.photo);
    });
  } else {
    const placeholderClass = colorsToPlaceholder(product.colors);
    pdpMainImage.className = `pdp-main-image ${placeholderClass}`;
    pdpMainImage.style.backgroundImage = '';
    pdpThumbs.innerHTML = `<button class="pdp-thumb ${placeholderClass} active" data-image="${placeholderClass}"></button>`;
  }
  initPDPGallery();

  // Color swatches (SKU variants — each has its own price and, optionally, its own image)
  const colorOptionGroup = document.getElementById('colorOptionGroup');
  const skus = (product.skus && product.skus.length)
    ? product.skus
    : (product.colors || []).map((color) => ({ id: null, color, price: product.price, image: null }));

  function selectSku(sku) {
    document.getElementById('colorValue').textContent = sku.color[0].toUpperCase() + sku.color.slice(1);
    document.getElementById('pdpPriceValue').textContent = `$${Number(sku.price).toFixed(2)}`;
    if (addBtn) addBtn.dataset.skuId = sku.id || '';
    if (sku.image) {
      pdpMainImage.className = 'pdp-main-image';
      setBackgroundImageWhenLoaded(pdpMainImage, sku.image);
    }
    // Each qty-stepper click adds/removes one MOQ "batch" of this SKU, and the
    // quantity resets to the MOQ whenever the buyer switches variants.
    const moq = Math.max(1, Number(sku.moq) || 1);
    const qtyValueEl = document.getElementById('qtyValue');
    if (qtyValueEl) {
      qtyValueEl.dataset.moq = moq;
      qtyValueEl.textContent = moq;
    }
  }

  if (skus.length) {
    colorOptionGroup.style.display = '';
    document.getElementById('colorSwatches').innerHTML = skus
      .map((sku, i) => `<button class="pdp-swatch ${variantPlaceholderClass(sku.color)} ${i === 0 ? 'active' : ''}" data-sku-index="${i}" data-color="${sku.color}" title="${escapeHtmlLocal(sku.color)}"></button>`)
      .join('');
    selectSku(skus[0]);

    document.getElementById('colorSwatches').addEventListener('click', (e) => {
      const index = e.target.dataset.skuIndex;
      if (index === undefined) return;
      document.querySelectorAll('#colorSwatches .pdp-swatch').forEach((s) => s.classList.remove('active'));
      e.target.classList.add('active');
      selectSku(skus[Number(index)]);
    });
  } else {
    colorOptionGroup.style.display = 'none';
  }

  renderBundleSection(product, products);

  // Related products (same category, excluding current product)
  const related = products.filter((p) => p.categorySlug === product.categorySlug && p.id !== product.id);
  const relatedSection = document.getElementById('relatedProductsTrack').closest('.category-block');
  if (related.length) {
    document.getElementById('relatedProductsTrack').innerHTML = related.map(renderProductCard).join('');
    enhanceProductCards(document.getElementById('relatedProductsTrack'));
    initCarousels();
    document.getElementById('relatedProductsTrack').dispatchEvent(new Event('scroll'));
  } else {
    relatedSection.style.display = 'none';
  }
}

// ---------- Cart page ----------

async function renderCartPage() {
  const cart = getCart();
  const emptyState = document.getElementById('cartEmptyState');
  const content = document.getElementById('cartContent');

  if (!cart.length) {
    emptyState.style.display = 'block';
    content.style.display = 'none';
    return;
  }
  emptyState.style.display = 'none';
  content.style.display = 'grid';

  const products = await fetchJSON('/api/products');
  const lines = cart
    .map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return null;
      const sku = item.skuId ? (product.skus || []).find((s) => s.id === item.skuId) : null;
      return { product, sku, skuId: item.skuId || null, size: item.size || null, quantity: item.quantity };
    })
    .filter(Boolean);

  function lineImageHtml(line) {
    const image = (line.sku && line.sku.image) || (line.product.images && line.product.images[0]);
    if (image) return `<div class="cart-item-image"><img class="img-loading" src="${image}" alt="${escapeHtmlLocal(line.product.name)}" ${IMG_LOADING_ATTRS}></div>`;
    return `<div class="cart-item-image ${colorsToPlaceholder(line.product.colors)}"></div>`;
  }

  function linePrice(line) {
    return line.sku ? line.sku.price : line.product.price;
  }

  function renderLines() {
    const itemsEl = document.getElementById('cartItems');
    itemsEl.innerHTML = lines.map((line) => `
      <div class="cart-item" data-product-id="${line.product.id}" data-sku-id="${line.skuId || ''}" data-size="${escapeHtmlLocal(line.size || '')}">
        ${lineImageHtml(line)}
        <div>
          <p class="cart-item-name">${escapeHtmlLocal(line.product.name)}</p>
          ${line.sku ? `<p class="cart-item-color">${line.sku.color[0].toUpperCase() + line.sku.color.slice(1)}</p>` : ''}
          ${line.size ? `<p class="cart-item-color">${escapeHtmlLocal(line.size)}</p>` : ''}
          <p class="cart-item-price">$${Number(linePrice(line)).toFixed(2)} each</p>
          <div class="cart-qty">
            <button type="button" data-qty-action="decrease" aria-label="Decrease quantity">&minus;</button>
            <span>${line.quantity}</span>
            <button type="button" data-qty-action="increase" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div class="cart-item-right">
          <p class="cart-item-line-total">$${(linePrice(line) * line.quantity).toFixed(2)}</p>
          <button type="button" class="cart-item-remove" data-remove>Remove</button>
        </div>
      </div>
    `).join('');

    const subtotal = lines.reduce((sum, line) => sum + linePrice(line) * line.quantity, 0);
    document.getElementById('cartSubtotal').textContent = `$${subtotal.toFixed(2)}`;
  }

  document.getElementById('cartItems').addEventListener('click', (e) => {
    const row = e.target.closest('.cart-item');
    if (!row) return;
    const productId = Number(row.dataset.productId);
    const skuId = row.dataset.skuId || null;
    const size = row.dataset.size || null;
    const line = lines.find((l) => l.product.id === productId && l.skuId === skuId && (l.size || null) === size);

    if (e.target.dataset.qtyAction === 'increase') {
      line.quantity += 1;
      setCartQuantity(productId, skuId, line.quantity, size);
      renderLines();
    } else if (e.target.dataset.qtyAction === 'decrease') {
      line.quantity = Math.max(1, line.quantity - 1);
      setCartQuantity(productId, skuId, line.quantity, size);
      renderLines();
    } else if (e.target.dataset.remove !== undefined) {
      removeFromCart(productId, skuId, size);
      const index = lines.findIndex((l) => l.product.id === productId && l.skuId === skuId && (l.size || null) === size);
      lines.splice(index, 1);
      if (!lines.length) {
        emptyState.style.display = 'block';
        content.style.display = 'none';
        return;
      }
      renderLines();
    }
  });

  const loggedInCustomer = getStoredCustomer();
  if (loggedInCustomer) {
    document.getElementById('checkoutName').value = loggedInCustomer.name || '';
    document.getElementById('checkoutEmail').value = loggedInCustomer.email || '';
    document.getElementById('checkoutAddress').value = loggedInCustomer.address || '';
  }

  document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      items: lines.map((line) => ({ productId: line.product.id, skuId: line.skuId, size: line.size, quantity: line.quantity })),
      customer: {
        name: document.getElementById('checkoutName').value.trim(),
        email: document.getElementById('checkoutEmail').value.trim(),
        address: document.getElementById('checkoutAddress').value.trim(),
      },
      note: document.getElementById('checkoutNote') ? document.getElementById('checkoutNote').value.trim() : '',
      customerId: loggedInCustomer ? loggedInCustomer.id : null,
    };

    try {
      const order = await fetchJSONWithBody('/api/orders', payload);
      clearCart();
      content.style.display = 'none';
      emptyState.style.display = 'none';
      document.getElementById('orderConfirmation').style.display = 'block';
      document.getElementById('orderConfirmationDetail').textContent =
        `Order #${order.id} — $${order.total.toFixed(2)} total. A confirmation has been sent to ${order.customer.email}.`;
    } catch (err) {
      alert(err.message);
    }
  });

  renderLines();
}

async function fetchJSONWithBody(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${url}`);
  }
  return res.json();
}

// ---------- Root-category nav links (present in the header on every page) ----------

async function renderNavCategoryLinks() {
  const navLinks = document.getElementById('navCategoryLinks');
  if (!navLinks) return;

  const categories = await fetchJSON('/api/categories');
  const topLevel = categories.filter((c) => !c.parentId);

  // Each root category with subcategories gets its own hover dropdown listing
  // just those — a root with no children is a plain link.
  navLinks.innerHTML = topLevel.map((cat) => {
    const children = categories.filter((c) => c.parentId === cat.id);
    const link = `<a href="new-in.html?category=${encodeURIComponent(cat.slug)}">${escapeHtmlLocal(cat.name)}</a>`;
    if (!children.length) return link;
    return `
      <div class="nav-item-has-menu">
        ${link}
        <div class="nav-category-dropdown">
          ${children.map((child) => `<a href="new-in.html?category=${encodeURIComponent(child.slug)}">${escapeHtmlLocal(child.name)}</a>`).join('')}
        </div>
      </div>
    `;
  }).join('');
}

renderNavCategoryLinks();

// ---------- Account page ----------

// getStoredCustomer() and CUSTOMER_STORAGE_KEY come from cart.js (loaded first on every page).

// Each signed-in buyer gets their own browsing history; signed-out visitors share a "guest" list.
function recentlyViewedKey() {
  const customer = getStoredCustomer();
  return customer ? `myk_recently_viewed_${customer.id}` : 'myk_recently_viewed_guest';
}

function getRecentlyViewed() {
  try {
    return JSON.parse(localStorage.getItem(recentlyViewedKey())) || [];
  } catch (e) {
    return [];
  }
}

function addToRecentlyViewed(productId) {
  const list = getRecentlyViewed().filter((id) => id !== productId);
  list.unshift(productId);
  localStorage.setItem(recentlyViewedKey(), JSON.stringify(list.slice(0, 12)));
}

const ORDER_STATUS_LABELS = {
  pending: 'Pending', processing: 'Processing', shipped: 'Shipped',
  completed: 'Completed', cancelled: 'Cancelled',
};

function renderOrderHistoryCard(order) {
  const date = new Date(order.createdAt).toLocaleDateString();
  return `
    <div class="order-history-card">
      <div class="order-history-header">
        <span>Order #${order.id} &middot; ${date}</span>
        <span class="order-history-status status-${order.status}">${ORDER_STATUS_LABELS[order.status] || order.status}</span>
      </div>
      <div class="order-history-items">
        ${order.items.map((item) => `
          <div class="order-history-item">
            ${item.image ? `<img class="img-loading" src="${item.image}" ${IMG_LOADING_ATTRS}>` : '<div class="thumb-placeholder"></div>'}
            <span>${escapeHtmlLocal(item.name)}${item.color ? ` (${escapeHtmlLocal(item.color)})` : ''} &times; ${item.quantity}</span>
          </div>
        `).join('')}
      </div>
      <div class="order-history-total">$${Number(order.total).toFixed(2)}</div>
    </div>
  `;
}

async function loadOrderHistory(customerId) {
  const container = document.getElementById('orderHistoryList');
  if (!container) return;
  const orders = await fetchJSON(`/api/customers/${customerId}/orders`);
  container.innerHTML = orders.length
    ? orders.map(renderOrderHistoryCard).join('')
    : '<p class="account-empty-note">No orders yet.</p>';
}

async function loadBrowsingHistory() {
  const container = document.getElementById('browsingHistoryList');
  if (!container) return;
  const ids = getRecentlyViewed();
  if (!ids.length) {
    container.innerHTML = '<p class="account-empty-note">No recently viewed products yet.</p>';
    return;
  }
  const products = await fetchJSON('/api/products');
  const viewed = ids.map((id) => products.find((p) => p.id === id)).filter(Boolean);
  container.innerHTML = viewed.length
    ? viewed.map(renderProductCard).join('')
    : '<p class="account-empty-note">No recently viewed products yet.</p>';
  enhanceProductCards(container);
}

// Sign In (account.html) and Create Account (register.html) are separate
// pages now, not tabs toggling forms in place — each page only has the one
// form it needs, plus a plain link over to the other page.

function renderAccountPage() {
  const authView = document.getElementById('authView');
  const accountView = document.getElementById('accountView');

  function showAccountView(c) {
    authView.style.display = 'none';
    accountView.style.display = 'block';
    document.getElementById('profileName').textContent = c.name;
    document.getElementById('profileEmail').textContent = c.email;
    document.getElementById('profileCountry').textContent = c.country ? `Country/Region: ${c.country}` : '';
    document.getElementById('profileBuyerManager').textContent = c.buyerManager ? `Buyer Manager: ${c.buyerManager}` : '';
    document.getElementById('profileAddress').textContent = c.address || '';
    loadOrderHistory(c.id);
    loadBrowsingHistory();
  }

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem(CUSTOMER_STORAGE_KEY);
    accountView.style.display = 'none';
    authView.style.display = 'block';
  });

  const customer = getStoredCustomer();
  if (customer) {
    showAccountView(customer);
    return;
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';
    try {
      const c = await fetchJSONWithBody('/api/customers/login', {
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value,
      });
      localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(c));
      showAccountView(c);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

function renderRegisterPage() {
  // Already signed in — nothing to register, go straight to the account page.
  if (getStoredCustomer()) {
    window.location.href = 'account.html';
    return;
  }

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('registerError');
    errorEl.textContent = '';
    try {
      const c = await fetchJSONWithBody('/api/customers/register', {
        name: document.getElementById('registerName').value.trim(),
        email: document.getElementById('registerEmail').value.trim(),
        password: document.getElementById('registerPassword').value,
        country: document.getElementById('registerCountry').value.trim(),
        buyerManager: document.getElementById('registerBuyerManager').value.trim(),
        address: document.getElementById('registerAddress').value.trim(),
      });
      localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(c));
      window.location.href = 'account.html';
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

// ---------- Account modal (index/new-in/product/cart/wishlist pages) ----------
// Just a Sign In / Create Account chooser — each option is a link to that
// page's own full form, not an embedded form switched via tabs.

function initAccountModal() {
  const icon = document.getElementById('accountIcon');
  const overlay = document.getElementById('authModalOverlay');
  if (!icon || !overlay) return;

  icon.addEventListener('click', (e) => {
    if (getStoredCustomer()) return; // logged in: let the link go to account.html
    e.preventDefault();
    overlay.classList.add('open');
  });

  document.getElementById('authModalClose').addEventListener('click', () => {
    overlay.classList.remove('open');
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
}

initAccountModal();

// ---------- Cart drawer (present on index/new-in/product/account pages) ----------

function initCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartDrawerOverlay');
  if (!drawer || !overlay) return;

  window.openCartDrawer = async function openCartDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    await renderCartDrawerContents();
  };

  window.closeCartDrawer = function closeCartDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  };

  document.getElementById('cartDrawerClose').addEventListener('click', window.closeCartDrawer);
  overlay.addEventListener('click', window.closeCartDrawer);

  const cartIcon = document.querySelector('a[aria-label="Cart"]');
  if (cartIcon) {
    cartIcon.addEventListener('click', (e) => {
      e.preventDefault();
      window.openCartDrawer();
    });
  }
}

async function renderCartDrawerContents() {
  const container = document.getElementById('cartDrawerItems');
  const subtotalEl = document.getElementById('cartDrawerSubtotal');
  if (!container) return;

  const cart = getCart();
  if (!cart.length) {
    container.innerHTML = '<p class="account-empty-note">Your bag is empty.</p>';
    subtotalEl.textContent = '$0.00';
    return;
  }

  const products = await fetchJSON('/api/products');
  let subtotal = 0;
  container.innerHTML = cart.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) return '';
    const sku = item.skuId ? (product.skus || []).find((s) => s.id === item.skuId) : null;
    const price = sku ? sku.price : product.price;
    const image = (sku && sku.image) || (product.images && product.images[0]);
    subtotal += price * item.quantity;
    return `
      <div class="cart-drawer-line">
        ${image ? `<img class="img-loading" src="${image}" alt="${escapeHtmlLocal(product.name)}" ${IMG_LOADING_ATTRS}>` : '<div class="thumb-placeholder"></div>'}
        <div>
          <p class="cart-drawer-line-name">${escapeHtmlLocal(product.name)}</p>
          ${sku ? `<p class="cart-drawer-line-color">${sku.color[0].toUpperCase() + sku.color.slice(1)}</p>` : ''}
          ${item.size ? `<p class="cart-drawer-line-color">${escapeHtmlLocal(item.size)}</p>` : ''}
          <p class="cart-drawer-line-price">${item.quantity} &times; $${price.toFixed(2)}</p>
        </div>
      </div>
    `;
  }).join('');
  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
}

initCartDrawer();

// ---------- Orders drawer (present on index/new-in/product/cart/account pages) ----------

function initOrdersDrawer() {
  const drawer = document.getElementById('ordersDrawer');
  const overlay = document.getElementById('ordersDrawerOverlay');
  const icon = document.getElementById('ordersIcon');
  if (!drawer || !overlay || !icon) return;

  function openOrdersDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    renderOrdersDrawerContents();
  }

  function closeOrdersDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  }

  icon.addEventListener('click', (e) => {
    e.preventDefault();
    openOrdersDrawer();
  });

  document.getElementById('ordersDrawerClose').addEventListener('click', closeOrdersDrawer);
  overlay.addEventListener('click', closeOrdersDrawer);

  document.getElementById('ordersDrawerLoginBtn')?.addEventListener('click', () => {
    closeOrdersDrawer();
    const authOverlay = document.getElementById('authModalOverlay');
    if (authOverlay) authOverlay.classList.add('open');
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function renderOrdersDrawerContents() {
  const container = document.getElementById('ordersDrawerItems');
  if (!container) return;

  const customer = getStoredCustomer();
  if (!customer) {
    container.innerHTML = `
      <p class="account-empty-note">Please log in to view your orders.</p>
      <button class="btn btn-dark" id="ordersDrawerLoginBtn" style="width:100%; margin-top:1rem;">Log In</button>
    `;
    document.getElementById('ordersDrawerLoginBtn').addEventListener('click', () => {
      document.getElementById('ordersDrawer').classList.remove('open');
      document.getElementById('ordersDrawerOverlay').classList.remove('open');
      const authOverlay = document.getElementById('authModalOverlay');
      if (authOverlay) authOverlay.classList.add('open');
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return;
  }

  container.innerHTML = '<p class="account-empty-note">Loading&hellip;</p>';
  const orders = await fetchJSON(`/api/customers/${customer.id}/orders`);
  container.innerHTML = orders.length
    ? orders.map(renderOrderHistoryCard).join('')
    : '<p class="account-empty-note">No orders yet.</p>';
}

initOrdersDrawer();
