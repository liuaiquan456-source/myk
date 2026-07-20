const CUSTOMER_STORAGE_KEY = 'myk_customer';

function getStoredCustomer() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_STORAGE_KEY));
  } catch (e) {
    return null;
  }
}

// Each signed-in buyer gets their own cart; signed-out visitors share a "guest" cart.
// This keeps carts, orders and browsing history fully isolated per account.
function cartStorageKey() {
  const customer = getStoredCustomer();
  return customer ? `myk_cart_${customer.id}` : 'myk_cart_guest';
}

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(cartStorageKey())) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(cartStorageKey(), JSON.stringify(cart));
  updateCartBadge();
}

// Cart lines are keyed by productId + skuId together, so different color
// variants of the same product show up as separate lines in the cart.
function sameLine(item, productId, skuId) {
  return item.productId === productId && (item.skuId || null) === (skuId || null);
}

function addToCart(productId, quantity = 1, skuId = null) {
  const cart = getCart();
  const existing = cart.find((item) => sameLine(item, productId, skuId));
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ productId, skuId: skuId || null, quantity });
  }
  saveCart(cart);
}

function removeFromCart(productId, skuId = null) {
  saveCart(getCart().filter((item) => !sameLine(item, productId, skuId)));
}

function setCartQuantity(productId, skuId, quantity) {
  const cart = getCart();
  const item = cart.find((i) => sameLine(i, productId, skuId));
  if (!item) return;
  if (quantity <= 0) {
    saveCart(cart.filter((i) => !sameLine(i, productId, skuId)));
  } else {
    item.quantity = quantity;
    saveCart(cart);
  }
}

function clearCart() {
  saveCart([]);
}

function cartTotalQuantity() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function updateCartBadge() {
  const count = cartTotalQuantity();
  document.querySelectorAll('.cart-count').forEach((el) => {
    el.textContent = count;
  });
}

updateCartBadge();
