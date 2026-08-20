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

// Cart lines are keyed by productId + skuId + size together, so different
// variants (or sizes) of the same product show up as separate lines.
function sameLine(item, productId, skuId, size) {
  return item.productId === productId
    && (item.skuId || null) === (skuId || null)
    && (item.size || null) === (size || null);
}

function addToCart(productId, quantity = 1, skuId = null, size = null) {
  const cart = getCart();
  const existing = cart.find((item) => sameLine(item, productId, skuId, size));
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ productId, skuId: skuId || null, size: size || null, quantity });
  }
  saveCart(cart);
}

function removeFromCart(productId, skuId = null, size = null) {
  saveCart(getCart().filter((item) => !sameLine(item, productId, skuId, size)));
}

function setCartQuantity(productId, skuId, quantity, size = null) {
  const cart = getCart();
  const item = cart.find((i) => sameLine(i, productId, skuId, size));
  if (!item) return;
  if (quantity <= 0) {
    saveCart(cart.filter((i) => !sameLine(i, productId, skuId, size)));
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

// Each signed-in buyer gets their own wishlist; signed-out visitors share a
// "guest" one — same isolation pattern as the cart and browsing history.
function wishlistStorageKey() {
  const customer = getStoredCustomer();
  return customer ? `myk_wishlist_${customer.id}` : 'myk_wishlist_guest';
}

function getWishlist() {
  try {
    return JSON.parse(localStorage.getItem(wishlistStorageKey())) || [];
  } catch (e) {
    return [];
  }
}

function saveWishlist(ids) {
  localStorage.setItem(wishlistStorageKey(), JSON.stringify(ids));
  updateWishlistBadge();
}

function isInWishlist(productId) {
  return getWishlist().includes(productId);
}

// Returns true if the product ended up in the wishlist, false if it was removed.
function toggleWishlist(productId) {
  const list = getWishlist();
  const index = list.indexOf(productId);
  if (index === -1) {
    list.push(productId);
  } else {
    list.splice(index, 1);
  }
  saveWishlist(list);
  return index === -1;
}

function updateWishlistBadge() {
  const count = getWishlist().length;
  document.querySelectorAll('.wishlist-count').forEach((el) => {
    el.textContent = count;
  });
}

updateWishlistBadge();

updateCartBadge();
