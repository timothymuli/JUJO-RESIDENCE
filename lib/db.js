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
      role TEXT NOT NULL,
      property_id INTEGER REFERENCES properties(id),
      full_name TEXT,
      phone TEXT,
      approval_status TEXT DEFAULT 'active',
      staff_title TEXT,
      can_access_mlolongo INTEGER NOT NULL DEFAULT 0,
      can_access_syokimau INTEGER NOT NULL DEFAULT 0,
      is_superadmin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      priority TEXT DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rent_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      property_id INTEGER NOT NULL REFERENCES properties(id),
      label TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      water_amount_cents INTEGER NOT NULL DEFAULT 0,
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

function tableColumns(d, table) {
  return d
    .prepare("PRAGMA table_info(" + table + ")")
    .all()
    .map(function (c) {
      return c.name;
    });
}

function applySuperadminFlags(d) {
  const raw = process.env.SUPERADMIN_EMAILS || "admin@jujo.local";
  const emails = raw
    .split(",")
    .map(function (s) {
      return s.trim().toLowerCase();
    })
    .filter(Boolean);
  const stmt = d.prepare(
    "UPDATE users SET is_superadmin = 1, can_access_mlolongo = 1, can_access_syokimau = 1 WHERE lower(email) = ?"
  );
  emails.forEach(function (e) {
    stmt.run(e);
  });
}

function ensureUnitsTable(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      unit_code TEXT NOT NULL,
      bedrooms TEXT,
      floor_note TEXT,
      monthly_rent_hint_cents INTEGER,
      vacant INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(property_id, unit_code)
    );
  `);
}

/** Rebuild core tables when upgrading from legacy CHECK(role admin|tenant) schema. */
function migrateWideSchema(d) {
  const userCols = tableColumns(d, "users");
  const needUserRebuild = !userCols.includes("is_superadmin");

  const mrCols = tableColumns(d, "maintenance_requests");
  const needMrAlter = mrCols.length > 0 && !mrCols.includes("category");

  const rrCols = tableColumns(d, "rent_records");
  const needRrAlter = rrCols.length > 0 && !rrCols.includes("water_amount_cents");

  if (!needUserRebuild && !needMrAlter && !needRrAlter) {
    ensureUnitsTable(d);
    return;
  }

  if (needUserRebuild) {
    d.pragma("foreign_keys = OFF");
    d.exec("BEGIN");
    try {
      d.exec("DROP TABLE IF EXISTS _mr_bak");
      d.exec("DROP TABLE IF EXISTS _rr_bak");
      d.exec("DROP TABLE IF EXISTS _u_bak");
      d.exec("CREATE TABLE _mr_bak AS SELECT * FROM maintenance_requests");
      d.exec("CREATE TABLE _rr_bak AS SELECT * FROM rent_records");
      d.exec("CREATE TABLE _u_bak AS SELECT * FROM users");
      d.exec("DROP TABLE maintenance_requests");
      d.exec("DROP TABLE rent_records");
      d.exec("DROP TABLE users");

      d.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          property_id INTEGER REFERENCES properties(id),
          full_name TEXT,
          phone TEXT,
          approval_status TEXT DEFAULT 'active',
          staff_title TEXT,
          can_access_mlolongo INTEGER NOT NULL DEFAULT 0,
          can_access_syokimau INTEGER NOT NULL DEFAULT 0,
          is_superadmin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      d.exec(`
        INSERT INTO users (
          id, email, password_hash, role, property_id, full_name, phone,
          approval_status, created_at, staff_title,
          can_access_mlolongo, can_access_syokimau, is_superadmin
        )
        SELECT
          id, email, password_hash, role, property_id, full_name, phone,
          COALESCE(approval_status, 'active'), created_at, NULL,
          CASE WHEN role = 'admin' THEN 1 ELSE 0 END,
          CASE WHEN role = 'admin' THEN 1 ELSE 0 END,
          CASE WHEN role = 'admin' THEN 1 ELSE 0 END
        FROM _u_bak;
      `);

      applySuperadminFlags(d);

      d.exec(`
        CREATE TABLE maintenance_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          property_id INTEGER NOT NULL REFERENCES properties(id),
          user_id INTEGER NOT NULL REFERENCES users(id),
          title TEXT NOT NULL,
          description TEXT,
          category TEXT,
          priority TEXT DEFAULT 'normal',
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      const bakMr = tableColumns(d, "_mr_bak");
      if (bakMr.includes("category")) {
        d.exec("INSERT INTO maintenance_requests SELECT * FROM _mr_bak");
      } else {
        d.exec(`
          INSERT INTO maintenance_requests (
            id, property_id, user_id, title, description, status, created_at, category, priority
          )
          SELECT id, property_id, user_id, title, description, status, created_at, NULL, 'normal'
          FROM _mr_bak;
        `);
      }

      d.exec(`
        CREATE TABLE rent_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          property_id INTEGER NOT NULL REFERENCES properties(id),
          label TEXT NOT NULL,
          amount_cents INTEGER NOT NULL,
          water_amount_cents INTEGER NOT NULL DEFAULT 0,
          due_date TEXT NOT NULL,
          paid_at TEXT,
          status TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'late')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      const bakRr = tableColumns(d, "_rr_bak");
      if (bakRr.includes("water_amount_cents")) {
        d.exec("INSERT INTO rent_records SELECT * FROM _rr_bak");
      } else {
        d.exec(`
          INSERT INTO rent_records (
            id, user_id, property_id, label, amount_cents, water_amount_cents,
            due_date, paid_at, status, created_at
          )
          SELECT id, user_id, property_id, label, amount_cents, 0,
                 due_date, paid_at, status, created_at
          FROM _rr_bak;
        `);
      }

      d.exec("DROP TABLE _mr_bak");
      d.exec("DROP TABLE _rr_bak");
      d.exec("DROP TABLE _u_bak");
      d.exec("COMMIT");
    } catch (err) {
      try {
        d.exec("ROLLBACK");
      } catch (e2) {}
      d.pragma("foreign_keys = ON");
      throw err;
    }
    d.pragma("foreign_keys = ON");
  } else {
    if (needMrAlter) {
      d.exec("ALTER TABLE maintenance_requests ADD COLUMN category TEXT");
      d.exec("ALTER TABLE maintenance_requests ADD COLUMN priority TEXT DEFAULT 'normal'");
    }
    if (needRrAlter) {
      d.exec(
        "ALTER TABLE rent_records ADD COLUMN water_amount_cents INTEGER NOT NULL DEFAULT 0"
      );
    }
  }
  ensureUnitsTable(d);
}

function migrateUserColumns(d) {
  const cols = tableColumns(d, "users");
  if (!cols.includes("phone")) {
    d.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  }
  if (!cols.includes("approval_status")) {
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
    name: "JUJO Heights Apartments Mlolongo",
  });
  insP.run({
    slug: "syokimau",
    name: "Blessed Haven Maisonette — TPA Court, Syokimau (back)",
  });

  const pM = d.prepare("SELECT id FROM properties WHERE slug = ?").get("mlolongo").id;
  const pS = d.prepare("SELECT id FROM properties WHERE slug = ?").get("syokimau").id;

  d.prepare(
    `INSERT INTO users (
       email, password_hash, role, property_id, full_name, phone, approval_status,
       can_access_mlolongo, can_access_syokimau, is_superadmin
     ) VALUES (?, ?, 'admin', NULL, 'Site admin', NULL, 'active', 1, 1, 1)`
  ).run("admin@jujo.local", hashAdmin);

  d.prepare(
    `INSERT INTO users (email, password_hash, role, property_id, full_name, phone, approval_status)
     VALUES (?, ?, 'tenant', ?, 'Sam M.', '+254700000001', 'active')`
  ).run("sam@mlolongo.demo", hashTenant, pM);

  d.prepare(
    `INSERT INTO users (email, password_hash, role, property_id, full_name, phone, approval_status)
     VALUES (?, ?, 'tenant', ?, 'Pat S.', '+254700000002', 'active')`
  ).run("pat@syokimau.demo", hashTenant, pS);

  const u1 = d.prepare("SELECT id FROM users WHERE email = ?").get("sam@mlolongo.demo").id;
  const u2 = d.prepare("SELECT id FROM users WHERE email = ?").get("pat@syokimau.demo").id;

  d.prepare(
    `INSERT INTO rent_records (user_id, property_id, label, amount_cents, water_amount_cents, due_date, status, paid_at)
     VALUES (?, ?, 'April 2026', 4500000, 50000, '2026-04-10', 'paid', datetime('now'))`
  ).run(u1, pM);

  d.prepare(
    `INSERT INTO rent_records (user_id, property_id, label, amount_cents, water_amount_cents, due_date, status)
     VALUES (?, ?, 'May 2026', 4500000, 50000, '2026-05-10', 'due')`
  ).run(u1, pM);

  d.prepare(
    `INSERT INTO rent_records (user_id, property_id, label, amount_cents, water_amount_cents, due_date, status)
     VALUES (?, ?, 'April 2026', 5200000, 0, '2026-04-10', 'due')`
  ).run(u2, pS);

  d.prepare(
    `INSERT INTO maintenance_requests (property_id, user_id, title, description, status, category, priority)
     VALUES (?, ?, 'Kitchen tap', 'Drips when fully closed.', 'open', 'plumbing', 'normal')`
  ).run(pM, u1);
}

function syncPropertyNames(d) {
  const names = [
    ["mlolongo", "JUJO Heights Apartments Mlolongo"],
    ["syokimau", "Blessed Haven Maisonette — TPA Court, Syokimau (back)"],
  ];
  const stmt = d.prepare("UPDATE properties SET name = ? WHERE slug = ?");
  names.forEach(function (row) {
    stmt.run(row[1], row[0]);
  });
}

function migrateTenantProfileAndDocuments(d) {
  const uc = tableColumns(d, "users");
  if (!uc.includes("house_number")) {
    d.exec("ALTER TABLE users ADD COLUMN house_number TEXT");
  }
  if (!uc.includes("bedrooms")) {
    d.exec("ALTER TABLE users ADD COLUMN bedrooms TEXT");
  }
  d.exec(`
    CREATE TABLE IF NOT EXISTS tenant_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL CHECK (doc_type IN ('national_id', 'lease_template', 'lease_signed')),
      stored_name TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  d.exec(
    "CREATE INDEX IF NOT EXISTS idx_tenant_documents_user ON tenant_documents(user_id)"
  );
}

function initDb() {
  db = open();
  migrate(db);
  migrateUserColumns(db);
  migrateWideSchema(db);
  migrateTenantProfileAndDocuments(db);
  seed(db);
  syncPropertyNames(db);
  applySuperadminFlags(db);
}

function getDb() {
  if (!db) initDb();
  return db;
}

module.exports = { initDb, getDb };
