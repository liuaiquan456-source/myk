const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'db.json');
const DB_EXAMPLE_PATH = path.join(__dirname, 'data', 'db.example.json');

// Seed for currencies on db.json files created before the currency feature
// existed — load() below backfills this in rather than requiring a fresh
// clone/bootstrap on already-deployed instances.
const DEFAULT_CURRENCIES = [
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', rate: 1 },
  { code: 'USD', name: 'US Dollar', symbol: '$', rate: 0.14 },
  { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.13 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', rate: 0.19 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', rate: 20.5 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', rate: 11.9 },
];

// db.json holds real customer data and is gitignored — on a fresh clone it
// won't exist yet, so bootstrap it from the sanitized example on first run.
function load() {
  if (!fs.existsSync(DB_PATH) && fs.existsSync(DB_EXAMPLE_PATH)) {
    fs.copyFileSync(DB_EXAMPLE_PATH, DB_PATH);
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  const db = JSON.parse(raw);

  // Backfill fields added after this db.json was first created.
  if (!db.currencies) {
    db.currencies = DEFAULT_CURRENCIES;
    save(db);
  }
  if (!db.inquiries) {
    db.inquiries = [];
    db.nextInquiryId = 1;
    save(db);
  }

  return db;
}

function save(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function slugify(name) {
  return name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Category slug is the sole join key between products/categories throughout
// this app (URLs, admin selects, API filters) — two categories sharing a slug
// become indistinguishable everywhere, so every slug must be unique across
// the whole tree, not just among siblings.
function uniqueSlug(base, existingSlugs) {
  let slug = base;
  let i = 2;
  while (existingSlugs.includes(slug)) {
    slug = `${base}-${i}`;
    i += 1;
  }
  return slug;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === check;
}

module.exports = { load, save, slugify, uniqueSlug, hashPassword, verifyPassword };
