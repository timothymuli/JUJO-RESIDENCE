"use strict";

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "data", "jujo.db");
let db;

function open() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const d = new Database(dbPath);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  return d;
}

function migrate(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'tenant')),
      property_id INTEGER REFERENCES properties(id),
      full_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rent_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      property_id INTEGER NOT NULL REFERENCES properties(id),
      label TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      paid_at TEXT,
      status TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'late')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_slug TEXT,
      name TEXT,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS registration_otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_e164 TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_reg_otp_phone ON registration_otps(phone_e164);
  `);
}

function migrateUserColumns(d) {
  const cols = d.prepare("PRAGMA table_info(users)").all();
  const names = cols.map(function (c) {
    return c.name;
  });
  if (!names.includes("phone")) {
    d.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  }
  if (!names.includes("approval_status")) {
    d.exec("ALTER TABLE users ADD COLUMN approval_status TEXT DEFAULT 'active'");
    d.prepare(
      "UPDATE users SET approval_status = 'active' WHERE approval_status IS NULL OR approval_status = ''"
    ).run();
  }
}

function seed(d) {
  const n = d.prepare("SELECT COUNT(*) AS c FROM properties").get().c;
  if (n > 0) return;

  const adminPass = process.env.ADMIN_PASSWORD || "changeme123";
  const hashAdmin = bcrypt.hashSync(adminPass, 10);
  const hashTenant = bcrypt.hashSync("tenant123", 10);

  const insP = d.prepare(
    "INSERT INTO properties (slug, name) VALUES (@slug, @name)"
  );
  insP.run({
    slug: "mlolongo",
    name: "JUJO Heights — Mlolongo",
  });
  insP.run({
    slug: "syokimau",
    name: "Blessed Haven — TPA Court, Syokimau (back)",
  });

  const pM = d.prepare("SELECT id FROM properties WHERE slug = ?").get(
    "mlolongo"
  ).id;
  const pS = d.prepare("SELECT id FROM properties WHERE slug = ?").get(
    "syokimau"
  ).id;

  d.prepare(
    `INSERT INTO users (email, password_hash, role, property_id, full_name, phone, approval_status)
     VALUES (?, ?, 'admin', NULL, 'Site admin', NULL, 'active')`
  ).run("admin@jujo.local", hashAdmin);

  d.prepare(
    `INSERT INTO users (email, password_hash, role, property_id, full_name, phone, approval_status)
     VALUES (?, ?, 'tenant', ?, 'Sam M.', '+254700000001', 'active')`
  ).run("sam@mlolongo.demo", hashTenant, pM);

  d.prepare(
    `INSERT INTO users (email, password_hash, role, property_id, full_name, phone, approval_status)
     VALUES (?, ?, 'tenant', ?, 'Pat S.', '+254700000002', 'active')`
  ).run("pat@syokimau.demo", hashTenant, pS);

  const u1 = d.prepare("SELECT id FROM users WHERE email = ?").get(
    "sam@mlolongo.demo"
  ).id;
  const u2 = d.prepare("SELECT id FROM users WHERE email = ?").get(
    "pat@syokimau.demo"
  ).id;

  d.prepare(
    `INSERT INTO rent_records (user_id, property_id, label, amount_cents, due_date, status, paid_at)
     VALUES (?, ?, 'April 2026', 4500000, '2026-04-05', 'paid', datetime('now'))`
  ).run(u1, pM);

  d.prepare(
    `INSERT INTO rent_records (user_id, property_id, label, amount_cents, due_date, status)
     VALUES (?, ?, 'May 2026', 4500000, '2026-05-05', 'due')`
  ).run(u1, pM);

  d.prepare(
    `INSERT INTO rent_records (user_id, property_id, label, amount_cents, due_date, status)
     VALUES (?, ?, 'April 2026', 5200000, '2026-04-05', 'due')`
  ).run(u2, pS);

  d.prepare(
    `INSERT INTO maintenance_requests (property_id, user_id, title, description, status)
     VALUES (?, ?, 'Kitchen tap', 'Drips when fully closed.', 'open')`
  ).run(pM, u1);
}

function syncPropertyNames(d) {
  const names = [
    ["mlolongo", "JUJO Heights — Mlolongo"],
    ["syokimau", "Blessed Haven — TPA Court, Syokimau (back)"],
  ];
  const stmt = d.prepare("UPDATE properties SET name = ? WHERE slug = ?");
  names.forEach(function (row) {
    stmt.run(row[1], row[0]);
  });
}

function initDb() {
  db = open();
  migrate(db);
  migrateUserColumns(db);
  seed(db);
  syncPropertyNames(db);
}

function getDb() {
  if (!db) initDb();
  return db;
}

module.exports = { initDb, getDb };
