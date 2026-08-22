const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { load, save, slugify, uniqueSlug, hashPassword, verifyPassword } = require('./db');

const ROOT = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// ---------- Admin auth ----------
// In-memory session store — a single-process deploy doesn't need anything
// heavier, and it matches this app's no-extra-dependencies footprint.
const ADMIN_SESSION_COOKIE = 'myk_admin_session';
const adminSessions = new Map();

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((pair) => {
      const idx = pair.indexOf('=');
      return [pair.slice(0, idx).trim(), decodeURIComponent(pair.slice(idx + 1).trim())];
    })
  );
}

function getAdminSession(req) {
  const token = parseCookies(req)[ADMIN_SESSION_COOKIE];
  return token ? adminSessions.get(token) : undefined;
}

app.post('/api/admin/login', (req, res) => {
  const db = load();
  const { username, password } = req.body || {};
  const admin = db.admin;
  if (!admin || !username || !password || username !== admin.username || !verifyPassword(password, admin.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, { username: admin.username });
  res.setHeader(
    'Set-Cookie',
    `${ADMIN_SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
  );
  res.json({ username: admin.username });
});

app.get('/api/admin/session', (req, res) => {
  const session = getAdminSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ username: session.username });
});

app.post('/api/admin/logout', (req, res) => {
  const token = parseCookies(req)[ADMIN_SESSION_COOKIE];
  if (token) adminSessions.delete(token);
  res.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  res.status(204).end();
});

// Requires both an active session and the current password — this is more
// sensitive than the rest of the admin API (which isn't session-gated), so
// it gets the extra check on top of the re-auth already required by the form.
app.put('/api/admin/credentials', (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: 'Not authenticated' });

  const db = load();
  const admin = db.admin;
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !admin || !verifyPassword(currentPassword, admin.password)) {
    return res.status(401).json({ error: '当前密码不正确' });
  }

  if (newPassword) {
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少需要 6 位' });
    }
    admin.password = hashPassword(newPassword);
  }

  save(db);
  res.json({ username: admin.username });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype)) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

function parseListField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

// ---------- Categories ----------

app.get('/api/categories', (req, res) => {
  const db = load();
  res.json(db.categories);
});

function parseParentId(value) {
  if (value === undefined || value === '' || value === 'null') return null;
  const id = Number(value);
  return Number.isNaN(id) ? null : id;
}

app.post('/api/categories', upload.single('image'), (req, res) => {
  const db = load();
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const category = {
    id: db.nextCategoryId++,
    name,
    slug: uniqueSlug(slugify(name), db.categories.map((c) => c.slug)),
    image: req.file ? `/uploads/${req.file.filename}` : null,
    parentId: parseParentId(req.body.parentId),
  };
  db.categories.push(category);
  save(db);
  res.status(201).json(category);
});

app.put('/api/categories/:id', upload.single('image'), (req, res) => {
  const db = load();
  const category = db.categories.find((c) => c.id === Number(req.params.id));
  if (!category) return res.status(404).json({ error: 'Category not found' });

  if (req.body.name) {
    category.name = req.body.name.trim();
    const otherSlugs = db.categories.filter((c) => c.id !== category.id).map((c) => c.slug);
    category.slug = uniqueSlug(slugify(category.name), otherSlugs);
  }
  if (req.body.parentId !== undefined) category.parentId = parseParentId(req.body.parentId);
  if (req.file) category.image = `/uploads/${req.file.filename}`;

  save(db);
  res.json(category);
});

app.delete('/api/categories/:id', (req, res) => {
  const db = load();
  const id = Number(req.params.id);
  const exists = db.categories.some((c) => c.id === id);
  if (!exists) return res.status(404).json({ error: 'Category not found' });

  db.categories = db.categories.filter((c) => c.id !== id);
  db.categories.forEach((c) => {
    if (c.parentId === id) c.parentId = null;
  });
  save(db);
  res.status(204).end();
});

// ---------- Products ----------

// A category filter also matches products in that category's subcategories,
// at any depth — e.g. a root category with no directly-assigned products
// still needs to show everything filed under its children.
function categoryAndDescendantSlugs(categories, slug) {
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

app.get('/api/products', (req, res) => {
  const db = load();
  // Newest first — admin's product list expects it, and homepage collection
  // blocks slice(0, limit) off this same order, so a new product needs to
  // land at the front to actually show up there instead of being cut off.
  let products = [...db.products].sort((a, b) => b.id - a.id);
  if (req.query.category) {
    const slugs = categoryAndDescendantSlugs(db.categories, req.query.category);
    products = products.filter((p) => slugs.includes(p.categorySlug));
  }
  if (req.query.collection) {
    products = products.filter((p) => (p.collections || []).includes(req.query.collection));
  }
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const db = load();
  const product = db.products.find((p) => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

function normalizeSkus(productId, rawSkus, fallbackPrice) {
  if (!Array.isArray(rawSkus)) return [];
  return rawSkus.map((sku, i) => ({
    id: sku.id || `sku_${productId}_${Date.now()}_${i}`,
    code: (sku.code || '').trim(),
    color: sku.color,
    price: sku.price !== undefined && sku.price !== '' ? Number(sku.price) : fallbackPrice,
    stock: sku.stock !== undefined && sku.stock !== '' ? Number(sku.stock) : 0,
    moq: sku.moq !== undefined && sku.moq !== '' ? Math.max(1, Number(sku.moq) || 1) : 1,
    image: sku.image || null,
  })).filter((sku) => sku.color);
}

app.post('/api/products', (req, res) => {
  const db = load();
  const { name, price, categorySlug, badge } = req.body;
  if (!name || !price || !categorySlug) {
    return res.status(400).json({ error: 'name, price and categorySlug are required' });
  }

  const id = db.nextProductId++;
  const skus = normalizeSkus(id, req.body.skus, Number(price));

  const product = {
    id,
    name: name.trim(),
    price: Number(price),
    categorySlug,
    colors: skus.length ? skus.map((s) => s.color) : parseListField(req.body.colors),
    collections: parseListField(req.body.collections),
    badge: badge && badge !== 'none' ? badge : null,
    images: Array.isArray(req.body.images) ? req.body.images : [],
    skus,
    description: (req.body.description || '').trim(),
    sizes: parseListField(req.body.sizes),
    bundleProductIds: Array.isArray(req.body.bundleProductIds) ? req.body.bundleProductIds.map(Number) : [],
  };
  db.products.push(product);
  save(db);
  res.status(201).json(product);
});

app.put('/api/products/:id', (req, res) => {
  const db = load();
  const product = db.products.find((p) => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const { name, price, categorySlug, badge } = req.body;
  if (name) product.name = name.trim();
  if (price) product.price = Number(price);
  if (categorySlug) product.categorySlug = categorySlug;
  if (req.body.collections !== undefined) product.collections = parseListField(req.body.collections);
  if (badge !== undefined) product.badge = badge && badge !== 'none' ? badge : null;
  if (Array.isArray(req.body.images)) product.images = req.body.images;
  if (req.body.description !== undefined) product.description = req.body.description.trim();
  if (req.body.sizes !== undefined) product.sizes = parseListField(req.body.sizes);
  if (Array.isArray(req.body.bundleProductIds)) product.bundleProductIds = req.body.bundleProductIds.map(Number);

  if (Array.isArray(req.body.skus)) {
    product.skus = normalizeSkus(product.id, req.body.skus, product.price);
    product.colors = product.skus.map((s) => s.color);
  } else if (req.body.colors !== undefined) {
    product.colors = parseListField(req.body.colors);
  }

  save(db);
  res.json(product);
});

app.delete('/api/products/:id', (req, res) => {
  const db = load();
  const id = Number(req.params.id);
  const exists = db.products.some((p) => p.id === id);
  if (!exists) return res.status(404).json({ error: 'Product not found' });

  db.products = db.products.filter((p) => p.id !== id);
  save(db);
  res.status(204).end();
});

app.patch('/api/products/:productId/skus/:skuId', (req, res) => {
  const db = load();
  const product = db.products.find((p) => p.id === Number(req.params.productId));
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const sku = (product.skus || []).find((s) => s.id === req.params.skuId);
  if (!sku) return res.status(404).json({ error: 'SKU not found' });

  if (req.body.stock !== undefined) sku.stock = Math.max(0, Number(req.body.stock) || 0);
  save(db);
  res.json(sku);
});

// ---------- Orders ----------

app.get('/api/orders', (req, res) => {
  const db = load();
  const orders = [...db.orders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((order) => ({
      ...order,
      // Stock is a live property of the product's SKU, not part of the order
      // snapshot — enrich it here so the admin UI can show/edit current stock.
      items: order.items.map((item) => {
        const product = db.products.find((p) => p.id === item.productId);
        let sku = item.skuId && product ? (product.skus || []).find((s) => s.id === item.skuId) : null;
        // Older orders placed before the SKU system (or with an unresolved
        // skuId) don't carry a skuId — fall back to a color match, or the
        // product's only SKU, so stock can still be shown/edited.
        if (!sku && product) {
          const skus = product.skus || [];
          sku = (item.color && skus.find((s) => s.color === item.color)) || (skus.length === 1 ? skus[0] : null);
        }
        return { ...item, resolvedSkuId: sku ? sku.id : null, stock: sku ? sku.stock : null };
      }),
    }));
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const db = load();
  const { items, customer, customerId } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must include at least one item' });
  }
  if (!customer || !customer.name || !customer.email) {
    return res.status(400).json({ error: 'Customer name and email are required' });
  }

  // Only attach the order to an account if the submitted email actually belongs
  // to that account — prevents a caller from tagging an order onto someone else's history.
  const normalizedEmail = customer.email.trim().toLowerCase();
  const account = customerId ? db.customers.find((c) => c.id === Number(customerId)) : null;
  const linkedCustomerId = account && account.email === normalizedEmail ? account.id : null;

  const orderItems = [];
  for (const item of items) {
    const product = db.products.find((p) => p.id === Number(item.productId));
    if (!product) continue;
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const sku = item.skuId ? (product.skus || []).find((s) => s.id === item.skuId) : null;
    orderItems.push({
      productId: product.id,
      skuId: sku ? sku.id : null,
      color: sku ? sku.color : null,
      name: product.name,
      image: (sku && sku.image) || (product.images && product.images[0]) || null,
      price: sku ? sku.price : product.price,
      quantity,
    });
  }

  if (!orderItems.length) {
    return res.status(400).json({ error: 'No valid items in order' });
  }

  const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const order = {
    id: db.nextOrderId++,
    customerId: linkedCustomerId,
    items: orderItems,
    customer: {
      name: customer.name.trim(),
      email: normalizedEmail,
      address: (customer.address || '').trim(),
    },
    total,
    status: 'pending',
    viewed: false,
    createdAt: new Date().toISOString(),
  };

  db.orders.push(order);
  save(db);
  res.status(201).json(order);
});

app.put('/api/orders/:id', (req, res) => {
  const db = load();
  const order = db.orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (req.body.status) order.status = req.body.status;
  if (req.body.viewed !== undefined) order.viewed = !!req.body.viewed;

  // Editing items here only corrects this order's own record (e.g. a manual
  // price adjustment) — it never writes back to the product/SKU's master price.
  if (Array.isArray(req.body.items)) {
    order.items = order.items.map((existing, i) => {
      const edit = req.body.items[i];
      if (!edit) return existing;
      return {
        ...existing,
        price: edit.price !== undefined ? Number(edit.price) : existing.price,
        quantity: edit.quantity !== undefined ? Math.max(1, Number(edit.quantity) || 1) : existing.quantity,
      };
    });
    order.total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  save(db);
  res.json(order);
});

app.delete('/api/orders/:id', (req, res) => {
  const db = load();
  const id = Number(req.params.id);
  const exists = db.orders.some((o) => o.id === id);
  if (!exists) return res.status(404).json({ error: 'Order not found' });

  db.orders = db.orders.filter((o) => o.id !== id);
  save(db);
  res.status(204).end();
});

// ---------- Custom inquiries ----------
// Submitted from the storefront's "Custom Inquiry" page — the reference
// photo is uploaded separately via /api/upload first, same as everywhere
// else images are handled, and its returned URL is passed in here.

app.get('/api/inquiries', (req, res) => {
  const db = load();
  const inquiries = [...db.inquiries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(inquiries);
});

app.post('/api/inquiries', (req, res) => {
  const db = load();
  const { name, country, city, contact, image } = req.body;
  if (!name || !country || !city || !contact) {
    return res.status(400).json({ error: 'Name, country, city and contact are required' });
  }

  const inquiry = {
    id: db.nextInquiryId++,
    name: name.trim(),
    country: country.trim(),
    city: city.trim(),
    contact: contact.trim(),
    image: image || null,
    status: 'new',
    createdAt: new Date().toISOString(),
  };
  db.inquiries.push(inquiry);
  save(db);
  res.status(201).json(inquiry);
});

app.put('/api/inquiries/:id', (req, res) => {
  const db = load();
  const inquiry = db.inquiries.find((i) => i.id === Number(req.params.id));
  if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });

  if (req.body.status) inquiry.status = req.body.status;
  save(db);
  res.json(inquiry);
});

app.delete('/api/inquiries/:id', (req, res) => {
  const db = load();
  const id = Number(req.params.id);
  const exists = db.inquiries.some((i) => i.id === id);
  if (!exists) return res.status(404).json({ error: 'Inquiry not found' });

  db.inquiries = db.inquiries.filter((i) => i.id !== id);
  save(db);
  res.status(204).end();
});

// ---------- Distributors ----------

app.get('/api/distributors', (req, res) => {
  const db = load();
  const distributors = [...db.distributors].sort((a, b) => a.name.localeCompare(b.name));
  res.json(distributors);
});

app.post('/api/distributors', (req, res) => {
  const db = load();
  const { name, wechat, whatsapp, country, address } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Distributor name is required' });
  }

  const distributor = {
    id: db.nextDistributorId++,
    name: name.trim(),
    wechat: (wechat || '').trim(),
    whatsapp: (whatsapp || '').trim(),
    country: (country || '').trim(),
    address: (address || '').trim(),
    createdAt: new Date().toISOString(),
  };
  db.distributors.push(distributor);
  save(db);
  res.status(201).json(distributor);
});

app.put('/api/distributors/:id', (req, res) => {
  const db = load();
  const distributor = db.distributors.find((d) => d.id === Number(req.params.id));
  if (!distributor) return res.status(404).json({ error: 'Distributor not found' });

  const { name, wechat, whatsapp, country, address } = req.body;
  const oldName = distributor.name;
  if (name && name.trim()) distributor.name = name.trim();
  if (wechat !== undefined) distributor.wechat = wechat.trim();
  if (whatsapp !== undefined) distributor.whatsapp = whatsapp.trim();
  if (country !== undefined) distributor.country = country.trim();
  if (address !== undefined) distributor.address = address.trim();

  if (distributor.name !== oldName) {
    db.customers.forEach((c) => {
      if (c.buyerManager === oldName) c.buyerManager = distributor.name;
    });
  }

  save(db);
  res.json(distributor);
});

app.delete('/api/distributors/:id', (req, res) => {
  const db = load();
  const id = Number(req.params.id);
  const exists = db.distributors.some((d) => d.id === id);
  if (!exists) return res.status(404).json({ error: 'Distributor not found' });

  db.distributors = db.distributors.filter((d) => d.id !== id);
  save(db);
  res.status(204).end();
});

// ---------- Customers ----------

function publicCustomer(customer) {
  const { password, ...rest } = customer;
  return rest;
}

app.post('/api/customers/register', (req, res) => {
  const db = load();
  const { name, email, password, country, buyerManager, address } = req.body;

  if (!name || !email || !password || !country) {
    return res.status(400).json({ error: 'Name, email, password and country are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (db.customers.some((c) => c.email === normalizedEmail)) {
    return res.status(400).json({ error: 'An account with this email already exists' });
  }

  const customer = {
    id: db.nextCustomerId++,
    name: name.trim(),
    email: normalizedEmail,
    country: country.trim(),
    buyerManager: (buyerManager || '').trim(),
    address: (address || '').trim(),
    password: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  db.customers.push(customer);
  save(db);
  res.status(201).json(publicCustomer(customer));
});

app.post('/api/customers/login', (req, res) => {
  const db = load();
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const customer = db.customers.find((c) => c.email === email.trim().toLowerCase());
  if (!customer || !verifyPassword(password, customer.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json(publicCustomer(customer));
});

app.get('/api/customers', (req, res) => {
  const db = load();
  const customers = [...db.customers]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicCustomer);
  res.json(customers);
});

app.put('/api/customers/:id', (req, res) => {
  const db = load();
  const customer = db.customers.find((c) => c.id === Number(req.params.id));
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { name, country, buyerManager, address } = req.body;
  if (name) customer.name = name.trim();
  if (country !== undefined) customer.country = country.trim();
  if (buyerManager !== undefined) customer.buyerManager = buyerManager.trim();
  if (address !== undefined) customer.address = address.trim();

  save(db);
  res.json(publicCustomer(customer));
});

app.delete('/api/customers/:id', (req, res) => {
  const db = load();
  const id = Number(req.params.id);
  const exists = db.customers.some((c) => c.id === id);
  if (!exists) return res.status(404).json({ error: 'Customer not found' });

  db.customers = db.customers.filter((c) => c.id !== id);
  save(db);
  res.status(204).end();
});

app.get('/api/customers/:id/orders', (req, res) => {
  const db = load();
  const customer = db.customers.find((c) => c.id === Number(req.params.id));
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const orders = db.orders
    .filter((o) => o.customerId === customer.id || o.customer.email === customer.email)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(orders);
});

// ---------- Currencies ----------

app.get('/api/currencies', (req, res) => {
  const db = load();
  res.json(db.currencies);
});

app.post('/api/currencies', (req, res) => {
  const db = load();
  const { code, name, symbol, rate } = req.body;
  if (!code || !name || !symbol || rate === undefined) {
    return res.status(400).json({ error: 'code, name, symbol and rate are required' });
  }
  if (db.currencies.some((c) => c.code === code)) {
    return res.status(400).json({ error: 'A currency with this code already exists' });
  }

  db.currencies.push({ code, name, symbol, rate: Number(rate) });
  save(db);
  res.status(201).json({ code, name, symbol, rate: Number(rate) });
});

app.put('/api/currencies/:code', (req, res) => {
  const db = load();
  const code = req.params.code;
  const currency = db.currencies.find((c) => c.code === code);
  if (!currency) return res.status(404).json({ error: 'Currency not found' });

  const { name, symbol, rate } = req.body;
  if (name !== undefined) currency.name = name;
  if (symbol !== undefined) currency.symbol = symbol;
  if (rate !== undefined && code !== 'CNY') currency.rate = Number(rate);
  save(db);
  res.json(currency);
});

app.delete('/api/currencies/:code', (req, res) => {
  const db = load();
  const code = req.params.code;
  if (code === 'CNY' || code === 'USD') {
    return res.status(400).json({ error: 'CNY and USD cannot be deleted' });
  }

  const exists = db.currencies.some((c) => c.code === code);
  if (!exists) return res.status(404).json({ error: 'Currency not found' });

  db.currencies = db.currencies.filter((c) => c.code !== code);
  save(db);
  res.status(204).end();
});

// ---------- Languages ----------

app.get('/api/locales', (req, res) => {
  const db = load();
  res.json(db.locales);
});

app.post('/api/locales', (req, res) => {
  const db = load();
  const { code, name, nativeName } = req.body;
  if (!code || !name || !nativeName) {
    return res.status(400).json({ error: 'code, name and nativeName are required' });
  }
  if (db.locales.some((l) => l.code === code)) {
    return res.status(400).json({ error: 'A locale with this code already exists' });
  }

  db.locales.push({ code, name, nativeName });
  // Seed the new locale's dictionary from English so every key has a value.
  db.translations[code] = { ...(db.translations.en || {}) };
  save(db);
  res.status(201).json({ code, name, nativeName });
});

app.delete('/api/locales/:code', (req, res) => {
  const db = load();
  const code = req.params.code;
  if (code === 'en') return res.status(400).json({ error: 'The English locale cannot be deleted' });

  const exists = db.locales.some((l) => l.code === code);
  if (!exists) return res.status(404).json({ error: 'Locale not found' });

  db.locales = db.locales.filter((l) => l.code !== code);
  delete db.translations[code];
  save(db);
  res.status(204).end();
});

app.get('/api/translations/:code', (req, res) => {
  const db = load();
  const base = db.translations.en || {};
  const overrides = db.translations[req.params.code] || {};
  res.json({ ...base, ...overrides });
});

app.put('/api/translations/:code', (req, res) => {
  const db = load();
  const code = req.params.code;
  if (!db.locales.some((l) => l.code === code)) {
    return res.status(404).json({ error: 'Locale not found' });
  }
  if (typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Body must be a key-value object' });
  }

  db.translations[code] = { ...(db.translations[code] || {}), ...req.body };
  save(db);
  res.json(db.translations[code]);
});

// ---------- Layout ----------

app.get('/api/layout', (req, res) => {
  const db = load();
  res.json(db.layout);
});

app.put('/api/layout', (req, res) => {
  const db = load();
  db.layout = req.body;
  save(db);
  res.json(db.layout);
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ---------- Admin theme ----------
// Lets the admin re-skin the backend itself (sidebar, buttons, panels, text)
// without touching CSS — admin/js/admin.js applies these as CSS custom
// property overrides on every admin page load. Unrelated to the storefront,
// which has its own fixed brand styling.

app.get('/api/admin-theme', (req, res) => {
  const db = load();
  res.json(db.adminTheme);
});

app.put('/api/admin-theme', (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: 'Not authenticated' });

  const db = load();
  const { primary, secondary, background, textPrimary, textSecondary, accent } = req.body || {};
  db.adminTheme = {
    primary: primary || db.adminTheme.primary,
    secondary: secondary || db.adminTheme.secondary,
    background: background || db.adminTheme.background,
    textPrimary: textPrimary || db.adminTheme.textPrimary,
    textSecondary: textSecondary || db.adminTheme.textSecondary,
    accent: accent || db.adminTheme.accent,
  };
  save(db);
  res.json(db.adminTheme);
});

// ---------- Error handling ----------

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message });
});

// ---------- Static files ----------

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/admin', express.static(path.join(ROOT, 'admin')));
app.use(express.static(ROOT));

app.listen(PORT, () => {
  console.log(`MYK server running at http://localhost:${PORT}`);
  console.log(`Admin dashboard at http://localhost:${PORT}/admin`);
});
