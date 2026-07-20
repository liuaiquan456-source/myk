const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'db.json');
const DB_EXAMPLE_PATH = path.join(__dirname, 'data', 'db.example.json');

// db.json holds real customer data and is gitignored — on a fresh clone it
// won't exist yet, so bootstrap it from the sanitized example on first run.
function load() {
  if (!fs.existsSync(DB_PATH) && fs.existsSync(DB_EXAMPLE_PATH)) {
    fs.copyFileSync(DB_EXAMPLE_PATH, DB_PATH);
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
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

module.exports = { load, save, slugify, hashPassword, verifyPassword };
