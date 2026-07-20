const menuToggle = document.getElementById('menuToggle');
const mainNav = document.getElementById('mainNav');

menuToggle?.addEventListener('click', () => {
  mainNav.classList.toggle('open');
});

// Header site search — the icon toggles a collapsing input open/closed;
// Enter navigates to the New In listing filtered by that keyword.
const siteSearchToggle = document.getElementById('siteSearchToggle');
const siteSearchInput = document.getElementById('siteSearchInput');
if (siteSearchToggle && siteSearchInput) {
  const siteSearchWrap = siteSearchInput.closest('.site-search');
  siteSearchToggle.addEventListener('click', () => {
    const isOpen = siteSearchWrap.classList.toggle('open');
    if (isOpen) siteSearchInput.focus();
    else if (!siteSearchInput.value) siteSearchInput.blur();
  });
  siteSearchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const query = siteSearchInput.value.trim();
    if (query) window.location.href = `new-in.html?search=${encodeURIComponent(query)}`;
  });
}

document.querySelectorAll('.subscribe-form').forEach((form) => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.querySelector('input[type="email"]').value;
    alert(`感谢订阅！优惠码已发送至 ${email}`);
    form.reset();
  });
});

// Enhances product cards with a hover image, wishlist button and click-to-navigate.
// Callable again after product cards are injected dynamically (see store.js).
function enhanceProductCards(root = document) {
  root.querySelectorAll('.product-image').forEach((image) => {
    if (image.dataset.enhanced) return;
    image.dataset.enhanced = 'true';

    const placeholderClass = [...image.classList].find((c) => c.startsWith('placeholder-'));
    if (placeholderClass) {
      const altImage = document.createElement('div');
      altImage.className = 'product-image-alt ' + placeholderClass;
      image.appendChild(altImage);
    }

    const btn = document.createElement('button');
    btn.className = 'wishlist-btn';
    btn.setAttribute('aria-label', 'Add to wishlist');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 20s-7-4.5-9.3-9C1 7.5 3 4 6.5 4c2 0 3.5 1.2 4.5 2.7C12 5.2 13.5 4 15.5 4 19 4 21 7.5 19.3 11 17 15.5 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.toggle('active');
    });
    image.appendChild(btn);
  });

  root.querySelectorAll('.product-card').forEach((card) => {
    if (card.dataset.enhanced) return;
    card.dataset.enhanced = 'true';
    card.addEventListener('click', () => {
      const id = card.dataset.productId;
      window.location.href = id ? `product.html?id=${id}` : 'product.html';
    });
  });
}

enhanceProductCards();

// Product detail page: gallery thumbnails.
// Callable again after the gallery is populated dynamically (see store.js).
function initPDPGallery() {
  const pdpMainImage = document.getElementById('pdpMainImage');
  if (!pdpMainImage) return;
  document.querySelectorAll('.pdp-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      document.querySelectorAll('.pdp-thumb').forEach((t) => t.classList.remove('active'));
      thumb.classList.add('active');
      if (thumb.dataset.image) {
        pdpMainImage.className = 'pdp-main-image ' + thumb.dataset.image;
        pdpMainImage.style.backgroundImage = '';
      } else if (thumb.dataset.photo) {
        pdpMainImage.className = 'pdp-main-image';
        pdpMainImage.style.backgroundImage = `url('${thumb.dataset.photo}')`;
      }
    });
  });
}
initPDPGallery();

// Product detail page: color swatches.
// Callable again after swatches are populated dynamically (see store.js).
function initColorSwatches() {
  const colorValue = document.getElementById('colorValue');
  document.querySelectorAll('#colorSwatches .pdp-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('#colorSwatches .pdp-swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
      if (colorValue) colorValue.textContent = swatch.dataset.color;
    });
  });
}
initColorSwatches();

// Product detail page: size options — sizes are rendered per-product by
// renderProductDetail() after this script runs, so this listens on the
// stable #sizeOptions container instead of binding to buttons directly.
document.getElementById('sizeOptions')?.addEventListener('click', (e) => {
  const sizeBtn = e.target.closest('.pdp-size-btn');
  if (!sizeBtn) return;
  sizeBtn.parentElement.querySelectorAll('.pdp-size-btn').forEach((s) => s.classList.remove('active'));
  sizeBtn.classList.add('active');
});

// Product detail page: quantity stepper
const qtyValue = document.getElementById('qtyValue');
document.querySelectorAll('.qty-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const step = parseInt(qtyValue.dataset.moq, 10) || 1;
    let qty = parseInt(qtyValue.textContent, 10);
    qty = btn.dataset.action === 'increase' ? qty + step : Math.max(step, qty - step);
    qtyValue.textContent = qty;
  });
});

// Product detail page: accordion
document.querySelectorAll('.accordion-trigger').forEach((trigger) => {
  trigger.addEventListener('click', () => {
    const item = trigger.closest('.accordion-item');
    const icon = trigger.querySelector('.accordion-icon');
    item.classList.toggle('open');
    icon.textContent = item.classList.contains('open') ? '−' : '+';
  });
});

// Product detail page: standalone wishlist button
document.querySelector('.pdp-wishlist')?.addEventListener('click', (e) => {
  e.currentTarget.classList.toggle('active');
});

// Product detail page: add to bag
document.querySelector('.pdp-add-btn')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const productId = Number(btn.dataset.productId);
  if (!productId) return;
  const skuId = btn.dataset.skuId || null;
  addToCart(productId, parseInt(qtyValue.textContent, 10), skuId);
  playAddedAnimation(btn);
  if (window.openCartDrawer) window.openCartDrawer();
});

function playAddedAnimation(btn) {
  const originalText = btn.dataset.originalText || btn.textContent;
  btn.dataset.originalText = originalText;
  btn.classList.add('added');
  btn.textContent = 'Added ✓';
  clearTimeout(btn._addedTimer);
  btn._addedTimer = setTimeout(() => {
    btn.classList.remove('added');
    btn.textContent = originalText;
  }, 1800);
}

function showCartToast(message) {
  let toast = document.querySelector('.cart-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'cart-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2000);
}

// Product carousels. Callable again after a track's contents load dynamically (see store.js).
function initCarousels(root = document) {
  root.querySelectorAll('.carousel-wrapper').forEach((wrapper) => {
    if (wrapper.dataset.enhanced) return;
    wrapper.dataset.enhanced = 'true';

    const track = wrapper.querySelector('.carousel-track');
    const prevBtn = wrapper.querySelector('.carousel-btn.prev');
    const nextBtn = wrapper.querySelector('.carousel-btn.next');

    const updateButtons = () => {
      prevBtn.disabled = track.scrollLeft <= 4;
      nextBtn.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    };

    const scrollByCard = (direction) => {
      const card = track.querySelector('.product-card');
      if (!card) return;
      const distance = card.getBoundingClientRect().width + 24;
      track.scrollBy({ left: direction * distance, behavior: 'smooth' });
    };

    prevBtn.addEventListener('click', () => scrollByCard(-1));
    nextBtn.addEventListener('click', () => scrollByCard(1));
    track.addEventListener('scroll', updateButtons);
    window.addEventListener('resize', updateButtons);
    updateButtons();
  });
}
initCarousels();

// Password visibility toggles (any .password-toggle button next to a password input)
const EYE_OPEN_ICON = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const EYE_CLOSED_ICON = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 3l18 18" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.6 5.2A11 11 0 0112 5c7 0 11 7 11 7a18.6 18.6 0 01-4.2 4.9M6.5 6.6A18.7 18.7 0 001 12s4 7 11 7a10.4 10.4 0 004.8-1.2M9.9 9.9a3 3 0 104.2 4.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

document.querySelectorAll('.password-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.innerHTML = showing ? EYE_OPEN_ICON : EYE_CLOSED_ICON;
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });
});
