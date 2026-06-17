"use strict";

require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");

const { initDb, getDb } = require("./lib/db");
const { normalizeKePhone } = require("./lib/phone");
const { sendSms } = require("./lib/sms");
const { startReminders } = require("./lib/reminders");
const { tenantDocUpload, uploadDirRoot, ensureUploadDir } = require("./lib/tenantUploads");

initDb();
const db = getDb();
ensureUploadDir();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: { ok: false, error: "Too many registration attempts. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: { ok: false, error: "Too many uploads. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

function hashOtp(code) {
  const salt = process.env.OTP_SALT || "jujo-otp-salt-change-in-production";
  return crypto.createHash("sha256").update(String(code) + salt).digest("hex");
}

function mpesaConfig() {
  return {
    mlolongo: {
      paybill: process.env.JUJO_MPESA_PAYBILL || "222111",
      account: process.env.JUJO_MPESA_ACCOUNT || "2319887",
      label: "JUJO Heights (Mlolongo) — rent & deposits",
    },
    syokimau: {
      paybill: process.env.BLESSED_MPESA_PAYBILL || "247247",
      account: process.env.BLESSED_MPESA_ACCOUNT || "749748",
      label: "Blessed Haven (Syokimau) — rent & deposits",
    },
  };
}

const sessionSecret =
  process.env.SESSION_SECRET || "dev-only-change-me-in-production";

app.use(
  session({
    name: "jujo.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  })
);

function jsonErr(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

function requireLogin(req, res, next) {
  if (!req.session.uid) {
    return jsonErr(res, 401, "Sign in first.");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.uid || req.session.role !== "admin") {
    return jsonErr(res, 403, "Admin only.");
  }
  next();
}

function requireTenant(req, res, next) {
  if (!req.session.uid || req.session.role !== "tenant") {
    return jsonErr(res, 403, "Tenants only.");
  }
  next();
}

var OPS_ROLES = ["admin", "landlord", "caretaker", "accountant"];

function loadUser(id) {
  return db
    .prepare(
      `SELECT id, email, password_hash, role, property_id, full_name, phone,
              COALESCE(approval_status, 'active') AS approval_status,
              staff_title, can_access_mlolongo, can_access_syokimau, is_superadmin,
              house_number, bedrooms
       FROM users WHERE id = ?`
    )
    .get(id);
}

function propertyFilterForUser(user) {
  if (!user) {
    return { sql: " AND 1=0 ", params: [] };
  }
  if (user.role === "admin" || user.role === "landlord") {
    return { sql: "", params: [] };
  }
  if (user.role === "caretaker" || user.role === "accountant") {
    var bits = [];
    if (Number(user.can_access_mlolongo)) {
      bits.push("p.slug = 'mlolongo'");
    }
    if (Number(user.can_access_syokimau)) {
      bits.push("p.slug = 'syokimau'");
    }
    if (!bits.length) {
      return { sql: " AND 1=0 ", params: [] };
    }
    return { sql: " AND (" + bits.join(" OR ") + ") ", params: [] };
  }
  return { sql: " AND 1=0 ", params: [] };
}

function messageFilterForUser(user) {
  if (!user) {
    return { sql: " AND 1=0 ", params: [] };
  }
  if (user.role === "admin" || user.role === "landlord") {
    return { sql: "", params: [] };
  }
  if (user.role === "caretaker" || user.role === "accountant") {
    var bits = [];
    if (Number(user.can_access_mlolongo)) {
      bits.push("cm.property_slug = 'mlolongo'");
    }
    if (Number(user.can_access_syokimau)) {
      bits.push("cm.property_slug = 'syokimau'");
    }
    if (!bits.length) {
      return { sql: " AND 1=0 ", params: [] };
    }
    return {
      sql:
        " AND (cm.property_slug IS NULL OR trim(cm.property_slug) = '' OR " +
        bits.join(" OR ") +
        ") ",
      params: [],
    };
  }
  return { sql: " AND 1=0 ", params: [] };
}

function canStaffAccessProperty(user, propertyId) {
  if (!user || !propertyId) {
    return false;
  }
  if (user.role === "admin" || user.role === "landlord") {
    return true;
  }
  if (user.role !== "caretaker" && user.role !== "accountant") {
    return false;
  }
  var row = db.prepare("SELECT slug FROM properties WHERE id = ?").get(propertyId);
  if (!row) {
    return false;
  }
  if (row.slug === "mlolongo") {
    return Number(user.can_access_mlolongo) === 1;
  }
  if (row.slug === "syokimau") {
    return Number(user.can_access_syokimau) === 1;
  }
  return false;
}

function canOpsAccessTenant(opsUser, tenantUserId) {
  var t = db
    .prepare("SELECT id, role, property_id FROM users WHERE id = ?")
    .get(tenantUserId);
  if (!t || t.role !== "tenant") {
    return false;
  }
  return canStaffAccessProperty(opsUser, t.property_id);
}

function safeStoredName(name) {
  return typeof name === "string" && /^[a-f0-9]{48}\.(pdf|jpg|png)$/.test(name);
}

function wrapUpload(mw) {
  return function (req, res, next) {
    mw(req, res, function (err) {
      if (err) {
        return jsonErr(res, 400, err.message || "Upload failed.");
      }
      next();
    });
  };
}

function requireOperations(req, res, next) {
  if (!req.session.uid) {
    return jsonErr(res, 401, "Sign in first.");
  }
  var u = loadUser(req.session.uid);
  if (!u || OPS_ROLES.indexOf(u.role) === -1) {
    return jsonErr(res, 403, "Operations team only.");
  }
  req.opsUser = u;
  next();
}

app.get("/api/health", function (req, res) {
  res.json({ ok: true });
});

app.get("/api/config", function (req, res) {
  const pay = mpesaConfig();
  res.json({
    ok: true,
    contactPhone: process.env.CONTACT_PHONE || "",
    contactEmail: process.env.CONTACT_EMAIL || "",
    mpesa: pay,
    registrationNote:
      process.env.REGISTRATION_AUTO_APPROVE === "1"
        ? "Accounts activate immediately after SMS verification."
        : "After SMS verification, the office activates your login (usually within one working day).",
    smsMock: process.env.SMS_MOCK === "1" || !process.env.AFRICASTALKING_API_KEY,
  });
});

app.get("/api/properties", function (req, res) {
  const rows = db
    .prepare("SELECT id, slug, name FROM properties ORDER BY id")
    .all();
  res.json({ ok: true, properties: rows });
});

app.post("/api/contact", function (req, res) {
  const email = (req.body.email || "").trim();
  const message = (req.body.message || "").trim();
  const name = (req.body.name || "").trim();
  const propertySlug = (req.body.property_slug || "").trim() || null;

  if (!email || !message) {
    return jsonErr(res, 400, "Email and message are required.");
  }
  if (email.length > 200 || message.length > 8000) {
    return jsonErr(res, 400, "Message too long.");
  }

  db.prepare(
    `INSERT INTO contact_messages (property_slug, name, email, message)
     VALUES (?, ?, ?, ?)`
  ).run(propertySlug, name || null, email, message);

  res.json({ ok: true });
});

app.post(
  "/api/auth/register/start",
  registerLimiter,
  function (req, res) {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";
    const fullName = (req.body.full_name || "").trim();
    const propertySlug = (req.body.property_slug || "").trim();
    const phoneRaw = req.body.phone || "";

    const phone = normalizeKePhone(phoneRaw);
    if (!phone) {
      return jsonErr(res, 400, "Enter a valid Kenyan mobile (e.g. 07… or 254…).");
    }
    if (!email || password.length < 8) {
      return jsonErr(res, 400, "Email and password (8+ characters) required.");
    }
    if (!["mlolongo", "syokimau"].includes(propertySlug)) {
      return jsonErr(res, 400, "Choose JUJO Heights (Mlolongo) or Blessed Haven (Syokimau).");
    }

    const prop = db
      .prepare("SELECT id FROM properties WHERE slug = ?")
      .get(propertySlug);
    if (!prop) {
      return jsonErr(res, 400, "Unknown property.");
    }

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) {
      return jsonErr(res, 409, "That email is already registered. Sign in instead.");
    }

    const dupPhone = db
      .prepare("SELECT id FROM users WHERE phone = ? AND role = 'tenant'")
      .get(phone);
    if (dupPhone) {
      return jsonErr(
        res,
        409,
        "This number is already linked to an account. Use sign in or contact the office."
      );
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const otpHash = hashOtp(otp);
    const passHash = bcrypt.hashSync(password, 10);
    const expires = new Date(Date.now() + 12 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    db.prepare("DELETE FROM registration_otps WHERE phone_e164 = ?").run(phone);
    db.prepare(
      `INSERT INTO registration_otps (phone_e164, otp_hash, expires_at, email, password_hash, full_name, property_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(phone, otpHash, expires, email, passHash, fullName || null, prop.id);

    const msg =
      "Your JUJO Residence verification code is " +
      otp +
      ". It expires in 12 minutes. Do not share this code.";
    sendSms(phone, msg).then(function () {
      /* ignore */
    });

    const payload = { ok: true };
    if (process.env.SMS_MOCK === "1" || !process.env.AFRICASTALKING_API_KEY) {
      payload.devOtp = otp;
      payload._note =
        "SMS not configured — code shown for testing only. Set Africa's Talking keys and unset SMS_MOCK for live SMS.";
    }
    res.json(payload);
  }
);

app.post("/api/auth/register/verify", registerLimiter, function (req, res) {
  const phone = normalizeKePhone(req.body.phone || "");
  const otp = (req.body.otp || "").replace(/\s/g, "");
  if (!phone || otp.length !== 6) {
    return jsonErr(res, 400, "Phone and 6-digit code required.");
  }

  const row = db
    .prepare(
      `SELECT id, otp_hash, expires_at, email, password_hash, full_name, property_id
       FROM registration_otps WHERE phone_e164 = ? ORDER BY id DESC LIMIT 1`
    )
    .get(phone);

  if (!row) {
    return jsonErr(res, 400, "No pending code for this number. Start again.");
  }
  if (new Date(row.expires_at.replace(" ", "T") + "Z") < new Date()) {
    db.prepare("DELETE FROM registration_otps WHERE id = ?").run(row.id);
    return jsonErr(res, 400, "Code expired. Request a new one.");
  }
  if (hashOtp(otp) !== row.otp_hash) {
    return jsonErr(res, 400, "Wrong code. Try again.");
  }

  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(row.email);
  if (exists) {
    db.prepare("DELETE FROM registration_otps WHERE id = ?").run(row.id);
    return jsonErr(res, 409, "Email was registered meanwhile. Sign in.");
  }

  const auto =
    process.env.REGISTRATION_AUTO_APPROVE === "1" ? "active" : "pending";

  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, role, property_id, full_name, phone, approval_status)
       VALUES (?, ?, 'tenant', ?, ?, ?, ?)`
    ).run(
      row.email,
      row.password_hash,
      row.property_id,
      row.full_name,
      phone,
      auto
    );

  db.prepare("DELETE FROM registration_otps WHERE id = ?").run(row.id);

  res.json({
    ok: true,
    approvalStatus: auto,
    message:
      auto === "active"
        ? "Account ready — you can sign in."
        : "Phone verified. The office will activate your login shortly.",
  });
});

app.post("/api/auth/login", function (req, res) {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (!email || !password) {
    return jsonErr(res, 400, "Email and password required.");
  }

  const user = db
    .prepare(
      `SELECT id, email, password_hash, role, property_id, full_name,
              COALESCE(approval_status, 'active') AS approval_status,
              staff_title, can_access_mlolongo, can_access_syokimau, is_superadmin
       FROM users WHERE email = ?`
    )
    .get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return jsonErr(res, 401, "Wrong email or password.");
  }

  if (user.role === "tenant" && user.approval_status === "pending") {
    return jsonErr(
      res,
      403,
      "Your account is waiting for office approval after registration. We’ll notify you when you can sign in."
    );
  }
  if (user.role === "tenant" && user.approval_status === "rejected") {
    return jsonErr(res, 403, "This account is not active. Contact the office.");
  }

  req.session.uid = user.id;
  req.session.role = user.role;
  req.session.propertyId = user.property_id;

  res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      propertyId: user.property_id,
      staffTitle: user.staff_title || null,
      access: {
        mlolongo: Number(user.can_access_mlolongo) === 1,
        syokimau: Number(user.can_access_syokimau) === 1,
      },
    },
  });
});

app.post("/api/auth/logout", function (req, res) {
  req.session.destroy(function () {
    res.json({ ok: true });
  });
});

app.get("/api/me", function (req, res) {
  if (!req.session.uid) {
    return res.json({ ok: true, user: null });
  }

  const user = loadUser(req.session.uid);

  if (!user) {
    req.session.destroy();
    return res.json({ ok: true, user: null });
  }

  let property = null;
  let mpesa = null;
  if (user.property_id) {
    property = db
      .prepare("SELECT id, slug, name FROM properties WHERE id = ?")
      .get(user.property_id);
    const cfg = mpesaConfig();
    if (property && property.slug === "mlolongo") {
      mpesa = cfg.mlolongo;
    } else if (property && property.slug === "syokimau") {
      mpesa = cfg.syokimau;
    }
  }

  res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      propertyId: user.property_id,
      approvalStatus: user.approval_status,
      staffTitle: user.staff_title || null,
      houseNumber: user.house_number || null,
      bedrooms: user.bedrooms || null,
      access: {
        mlolongo: Number(user.can_access_mlolongo) === 1,
        syokimau: Number(user.can_access_syokimau) === 1,
      },
    },
    property,
    mpesa,
  });
});

app.get("/api/maintenance", requireLogin, function (req, res) {
  var u = loadUser(req.session.uid);
  if (!u) {
    return jsonErr(res, 401, "Sign in first.");
  }
  if (OPS_ROLES.indexOf(u.role) !== -1) {
    var pf = propertyFilterForUser(u);
    var sqlOps =
      `SELECT m.id, m.title, m.description, m.category, m.priority, m.status, m.created_at,
              p.slug AS property_slug, p.name AS property_name,
              u.email AS tenant_email
       FROM maintenance_requests m
       JOIN properties p ON p.id = m.property_id
       JOIN users u ON u.id = m.user_id
       WHERE 1=1 ` +
      pf.sql +
      ` ORDER BY datetime(m.created_at) DESC`;
    var rowsOps = db.prepare(sqlOps).all(...pf.params);
    return res.json({ ok: true, requests: rowsOps });
  }

  if (u.role !== "tenant") {
    return jsonErr(res, 403, "Not allowed.");
  }

  const rows = db
    .prepare(
      `SELECT m.id, m.title, m.description, m.category, m.priority, m.status, m.created_at,
              p.slug AS property_slug, p.name AS property_name
       FROM maintenance_requests m
       JOIN properties p ON p.id = m.property_id
       WHERE m.user_id = ?
       ORDER BY datetime(m.created_at) DESC`
    )
    .all(req.session.uid);

  res.json({ ok: true, requests: rows });
});

app.post("/api/maintenance", requireTenant, function (req, res) {
  const pid = req.session.propertyId;
  if (!pid) {
    return jsonErr(res, 400, "No property on this account.");
  }

  const title = (req.body.title || "").trim();
  const description = (req.body.description || "").trim();
  var category = (req.body.category || "general").trim().slice(0, 64) || "general";
  var priority = (req.body.priority || "normal").trim();
  if (["low", "normal", "high", "urgent"].indexOf(priority) === -1) {
    priority = "normal";
  }

  if (!title) {
    return jsonErr(res, 400, "Title is required.");
  }

  const info = db
    .prepare(
      `INSERT INTO maintenance_requests (property_id, user_id, title, description, category, priority)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(pid, req.session.uid, title, description || null, category, priority);

  res.json({ ok: true, id: info.lastInsertRowid });
});

app.patch("/api/maintenance/:id", requireOperations, function (req, res) {
  var u = req.opsUser;
  const id = Number(req.params.id);
  const status = (req.body.status || "").trim();

  if (!["open", "in_progress", "done"].includes(status)) {
    return jsonErr(res, 400, "Invalid status.");
  }

  var row = db
    .prepare("SELECT property_id FROM maintenance_requests WHERE id = ?")
    .get(id);
  if (!row) {
    return jsonErr(res, 404, "Request not found.");
  }
  if (!canStaffAccessProperty(u, row.property_id)) {
    return jsonErr(res, 403, "You cannot update requests for this property.");
  }

  const r = db
    .prepare("UPDATE maintenance_requests SET status = ? WHERE id = ?")
    .run(status, id);

  if (r.changes === 0) {
    return jsonErr(res, 404, "Request not found.");
  }

  res.json({ ok: true });
});

app.get("/api/rent", requireLogin, function (req, res) {
  var u = loadUser(req.session.uid);
  if (!u) {
    return jsonErr(res, 401, "Sign in first.");
  }
  if (OPS_ROLES.indexOf(u.role) !== -1) {
    var pfR = propertyFilterForUser(u);
    var sqlR =
      `SELECT r.id, r.label, r.amount_cents, r.water_amount_cents, r.due_date, r.paid_at, r.status,
              u.email AS tenant_email, p.slug AS property_slug, p.name AS property_name
       FROM rent_records r
       JOIN users u ON u.id = r.user_id
       JOIN properties p ON p.id = r.property_id
       WHERE 1=1 ` +
      pfR.sql +
      ` ORDER BY datetime(r.due_date) DESC`;
    var rowsR = db.prepare(sqlR).all(...pfR.params);
    return res.json({ ok: true, records: rowsR });
  }

  const rows = db
    .prepare(
      `SELECT id, label, amount_cents, water_amount_cents, due_date, paid_at, status
       FROM rent_records
       WHERE user_id = ?
       ORDER BY datetime(due_date) DESC`
    )
    .all(req.session.uid);

  res.json({ ok: true, records: rows });
});

app.post("/api/rent/record", requireOperations, function (req, res) {
  var u = req.opsUser;
  const userId = Number(req.body.user_id);
  const propertyId = Number(req.body.property_id);
  const label = (req.body.label || "").trim();
  const amountCents = Number(req.body.amount_cents);
  var waterCents = Number(req.body.water_amount_cents);
  const dueDate = (req.body.due_date || "").trim();
  const paid = Boolean(req.body.paid);

  if (!Number.isFinite(waterCents) || waterCents < 0) {
    waterCents = 0;
  }

  if (!userId || !propertyId || !label || !dueDate || !Number.isFinite(amountCents)) {
    return jsonErr(res, 400, "Missing or invalid fields.");
  }
  if (!canStaffAccessProperty(u, propertyId)) {
    return jsonErr(res, 403, "You cannot post rent lines for this property.");
  }

  const paidAt = paid ? new Date().toISOString().slice(0, 19).replace("T", " ") : null;
  const status = paid ? "paid" : "due";

  db.prepare(
    `INSERT INTO rent_records (user_id, property_id, label, amount_cents, water_amount_cents, due_date, paid_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, propertyId, label, amountCents, waterCents, dueDate, paidAt, status);

  res.json({ ok: true });
});

app.post("/api/admin/users", requireAdmin, function (req, res) {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const fullName = (req.body.full_name || "").trim();
  const propertyId = Number(req.body.property_id);

  if (!email || password.length < 8) {
    return jsonErr(res, 400, "Email and password (8+ chars) required.");
  }
  if (!propertyId) {
    return jsonErr(res, 400, "property_id required.");
  }

  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) {
    return jsonErr(res, 409, "That email is already registered.");
  }

  const hash = bcrypt.hashSync(password, 10);
  var houseNum = (req.body.house_number || "").trim().slice(0, 64) || null;
  var beds = (req.body.bedrooms || "").trim().slice(0, 32) || null;
  db.prepare(
    `INSERT INTO users (email, password_hash, role, property_id, full_name, phone, approval_status, house_number, bedrooms)
     VALUES (?, ?, 'tenant', ?, ?, NULL, 'active', ?, ?)`
  ).run(email, hash, propertyId, fullName || null, houseNum, beds);

  res.json({ ok: true });
});

app.get("/api/admin/users", requireOperations, function (req, res) {
  var u = req.opsUser;
  var pf = propertyFilterForUser(u);
  var sqlU =
    `SELECT u.id, u.email, u.full_name, u.phone, u.property_id,
            u.house_number, u.bedrooms,
            COALESCE(u.approval_status, 'active') AS approval_status,
            p.slug AS property_slug, p.name AS property_name
     FROM users u
     LEFT JOIN properties p ON p.id = u.property_id
     WHERE u.role = 'tenant' ` +
    pf.sql +
    ` ORDER BY u.email`;
  var rows = db.prepare(sqlU).all(...pf.params);
  res.json({ ok: true, users: rows });
});

app.get("/api/admin/pending-tenants", requireOperations, function (req, res) {
  var u = req.opsUser;
  var pf = propertyFilterForUser(u);
  var sqlP =
    `SELECT u.id, u.email, u.full_name, u.phone, u.created_at,
            p.slug AS property_slug, p.name AS property_name
     FROM users u
     JOIN properties p ON p.id = u.property_id
     WHERE u.role = 'tenant' AND COALESCE(u.approval_status, 'active') = 'pending' ` +
    pf.sql +
    ` ORDER BY u.id DESC`;
  var rows = db.prepare(sqlP).all(...pf.params);
  res.json({ ok: true, tenants: rows });
});

app.post("/api/admin/users/:id/approve", requireOperations, function (req, res) {
  var u = req.opsUser;
  const id = Number(req.params.id);
  var t = db
    .prepare(
      `SELECT u.id, u.property_id FROM users u
       WHERE u.id = ? AND u.role = 'tenant' AND COALESCE(u.approval_status, 'active') = 'pending'`
    )
    .get(id);
  if (!t) {
    return jsonErr(res, 404, "Pending tenant not found.");
  }
  if (!canStaffAccessProperty(u, t.property_id)) {
    return jsonErr(res, 403, "You cannot approve tenants for this property.");
  }
  const r = db
    .prepare(
      `UPDATE users SET approval_status = 'active' WHERE id = ? AND role = 'tenant'`
    )
    .run(id);
  if (r.changes === 0) {
    return jsonErr(res, 404, "Tenant not found.");
  }
  res.json({ ok: true });
});

app.get("/api/admin/messages", requireOperations, function (req, res) {
  var u = req.opsUser;
  var mf = messageFilterForUser(u);
  var sqlM =
    `SELECT id, property_slug, name, email, message, created_at
     FROM contact_messages cm
     WHERE 1=1 ` +
    mf.sql +
    ` ORDER BY datetime(cm.created_at) DESC
     LIMIT 100`;
  var rows = db.prepare(sqlM).all(...mf.params);
  res.json({ ok: true, messages: rows });
});

app.get("/api/staff/summary", requireOperations, function (req, res) {
  var u = req.opsUser;
  var pf = propertyFilterForUser(u);
  var suffix = pf.sql || "";

  var tenantsByProp = db
    .prepare(
      `SELECT p.slug, COUNT(*) AS c
       FROM users u
       JOIN properties p ON p.id = u.property_id
       WHERE u.role = 'tenant' AND COALESCE(u.approval_status, 'active') = 'active' ` +
        suffix +
        ` GROUP BY p.slug`
    )
    .all(...pf.params);

  var pendingMaint = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM maintenance_requests m
       JOIN properties p ON p.id = m.property_id
       WHERE m.status != 'done' ` + suffix
    )
    .get(...pf.params).c;

  var arrears = db
    .prepare(
      `SELECT COUNT(*) AS c, IFNULL(SUM(r.amount_cents + r.water_amount_cents), 0) AS total_cents
       FROM rent_records r
       JOIN properties p ON p.id = r.property_id
       WHERE r.status IN ('due', 'late') ` + suffix
    )
    .get(...pf.params);

  var vacant = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM units un
       JOIN properties p ON p.id = un.property_id
       WHERE un.vacant = 1 ` + suffix
    )
    .get(...pf.params);

  res.json({
    ok: true,
    summary: {
      tenantsByProperty: tenantsByProp,
      openMaintenanceCount: pendingMaint,
      arrearsCount: arrears.c,
      arrearsTotalCents: arrears.total_cents,
      vacantUnits: vacant.c,
      billing: {
        currency: "KES",
        dueDay: 10,
        graceUntilDay: 12,
        lateFee: "none",
      },
    },
  });
});

app.get("/api/staff/units", requireOperations, function (req, res) {
  var u = req.opsUser;
  var pf = propertyFilterForUser(u);
  var sqlUn =
    `SELECT un.id, un.unit_code, un.bedrooms, un.floor_note, un.monthly_rent_hint_cents, un.vacant,
            p.slug AS property_slug, p.name AS property_name
     FROM units un
     JOIN properties p ON p.id = un.property_id
     WHERE 1=1 ` +
    pf.sql +
    ` ORDER BY p.slug, un.unit_code`;
  var rows = db.prepare(sqlUn).all(...pf.params);
  res.json({ ok: true, units: rows });
});

app.post("/api/staff/units", requireOperations, function (req, res) {
  var u = req.opsUser;
  const propertyId = Number(req.body.property_id);
  const unitCode = (req.body.unit_code || "").trim().slice(0, 32);
  const bedrooms = (req.body.bedrooms || "").trim().slice(0, 32) || null;
  const floorNote = (req.body.floor_note || "").trim().slice(0, 120) || null;
  var hint = Number(req.body.monthly_rent_hint_cents);
  if (!Number.isFinite(hint)) {
    hint = null;
  }
  const vacant = req.body.vacant === false ? 0 : 1;

  if (!propertyId || !unitCode) {
    return jsonErr(res, 400, "property_id and unit_code required.");
  }
  if (!canStaffAccessProperty(u, propertyId)) {
    return jsonErr(res, 403, "Not allowed for this property.");
  }

  try {
    var info = db
      .prepare(
        `INSERT INTO units (property_id, unit_code, bedrooms, floor_note, monthly_rent_hint_cents, vacant)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(propertyId, unitCode, bedrooms, floorNote, hint, vacant);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    if (e && String(e.message).indexOf("UNIQUE") !== -1) {
      return jsonErr(res, 409, "That unit code already exists for this property.");
    }
    throw e;
  }
});

function mapTenantDocument(row) {
  return {
    id: row.id,
    docType: row.doc_type,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    downloadUrl: "/api/documents/" + row.id + "/file",
  };
}

app.get("/api/tenant/documents", requireTenant, function (req, res) {
  var rows = db
    .prepare(
      `SELECT id, doc_type, original_name, mime_type, size_bytes, created_at
       FROM tenant_documents
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC`
    )
    .all(req.session.uid);
  res.json({
    ok: true,
    documents: rows.map(mapTenantDocument),
  });
});

app.post(
  "/api/tenant/documents",
  uploadLimiter,
  requireLogin,
  function (req, res, next) {
    if (req.session.role !== "tenant") {
      return jsonErr(res, 403, "Tenants only.");
    }
    next();
  },
  wrapUpload(tenantDocUpload.single("file")),
  function (req, res) {
    var docType = (req.body.doc_type || "").trim();
    if (["national_id", "lease_signed"].indexOf(docType) === -1) {
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {}
      }
      return jsonErr(res, 400, "doc_type must be national_id or lease_signed.");
    }
    if (!req.file) {
      return jsonErr(res, 400, "Choose a PDF or image file.");
    }
    try {
      var info = db
        .prepare(
          `INSERT INTO tenant_documents (user_id, doc_type, stored_name, original_name, mime_type, size_bytes, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          req.session.uid,
          docType,
          req.file.filename,
          String(req.file.originalname || "").slice(0, 255),
          req.file.mimetype,
          req.file.size,
          req.session.uid
        );
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e2) {}
      throw e;
    }
  }
);

app.get("/api/staff/tenants/:tenantId/documents", requireOperations, function (req, res) {
  var u = req.opsUser;
  var tenantId = Number(req.params.tenantId);
  if (!tenantId) {
    return jsonErr(res, 400, "Invalid tenant.");
  }
  if (!canOpsAccessTenant(u, tenantId)) {
    return jsonErr(res, 403, "Not allowed for this tenant.");
  }
  var rows = db
    .prepare(
      `SELECT id, doc_type, original_name, mime_type, size_bytes, created_at
       FROM tenant_documents
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC`
    )
    .all(tenantId);
  res.json({
    ok: true,
    tenantId: tenantId,
    documents: rows.map(mapTenantDocument),
  });
});

app.post(
  "/api/staff/tenants/:tenantId/documents",
  uploadLimiter,
  requireOperations,
  wrapUpload(tenantDocUpload.single("file")),
  function (req, res) {
    var u = req.opsUser;
    var tenantId = Number(req.params.tenantId);
    var docType = (req.body.doc_type || "").trim();
    if (!tenantId) {
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {}
      }
      return jsonErr(res, 400, "Invalid tenant.");
    }
    if (
      ["national_id", "lease_template", "lease_signed"].indexOf(docType) === -1
    ) {
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {}
      }
      return jsonErr(
        res,
        400,
        "doc_type must be national_id, lease_template, or lease_signed."
      );
    }
    if (!canOpsAccessTenant(u, tenantId)) {
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {}
      }
      return jsonErr(res, 403, "Not allowed for this tenant.");
    }
    if (!req.file) {
      return jsonErr(res, 400, "Choose a PDF or image file.");
    }
    try {
      var info = db
        .prepare(
          `INSERT INTO tenant_documents (user_id, doc_type, stored_name, original_name, mime_type, size_bytes, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          tenantId,
          docType,
          req.file.filename,
          String(req.file.originalname || "").slice(0, 255),
          req.file.mimetype,
          req.file.size,
          u.id
        );
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e2) {}
      throw e;
    }
  }
);

app.patch("/api/staff/tenants/:tenantId/profile", requireOperations, function (req, res) {
  var u = req.opsUser;
  var tenantId = Number(req.params.tenantId);
  if (!tenantId) {
    return jsonErr(res, 400, "Invalid tenant.");
  }
  if (!canOpsAccessTenant(u, tenantId)) {
    return jsonErr(res, 403, "Not allowed for this tenant.");
  }
  var house = (req.body.house_number || "").trim().slice(0, 64) || null;
  var beds = (req.body.bedrooms || "").trim().slice(0, 32) || null;
  db.prepare(
    "UPDATE users SET house_number = ?, bedrooms = ? WHERE id = ? AND role = 'tenant'"
  ).run(house, beds, tenantId);
  res.json({ ok: true });
});

app.get("/api/documents/:id/file", requireLogin, function (req, res) {
  var docId = Number(req.params.id);
  if (!docId) {
    return jsonErr(res, 400, "Invalid document.");
  }
  var row = db
    .prepare(
      `SELECT d.id, d.stored_name, d.mime_type, d.original_name, d.user_id AS owner_id,
              u.role AS owner_role, u.property_id
       FROM tenant_documents d
       JOIN users u ON u.id = d.user_id
       WHERE d.id = ?`
    )
    .get(docId);
  if (!row || !safeStoredName(row.stored_name)) {
    return jsonErr(res, 404, "Not found.");
  }
  var viewer = loadUser(req.session.uid);
  if (!viewer) {
    return jsonErr(res, 401, "Sign in first.");
  }
  var allowed = false;
  if (viewer.role === "tenant" && row.owner_id === viewer.id) {
    allowed = true;
  } else if (OPS_ROLES.indexOf(viewer.role) !== -1) {
    allowed = canOpsAccessTenant(viewer, row.owner_id);
  }
  if (!allowed) {
    return jsonErr(res, 403, "Not allowed.");
  }
  var root = path.resolve(uploadDirRoot());
  var base = path.basename(row.stored_name);
  var full = path.resolve(path.join(root, base));
  var rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel) || base !== row.stored_name) {
    return jsonErr(res, 404, "Not found.");
  }
  if (!fs.existsSync(full)) {
    return jsonErr(res, 404, "File missing on server.");
  }
  var disp = row.original_name || base;
  res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=" + JSON.stringify(disp)
  );
  fs.createReadStream(full).pipe(res);
});

app.get("/api/health", function (req, res) {
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, "public")));

app.use(function (req, res) {
  if (req.path.startsWith("/api/")) {
    return jsonErr(res, 404, "Not found.");
  }
  res.status(404).send("Not found.");
});

if (process.env.DISABLE_REMINDERS !== "1") {
  startReminders(getDb, sendSms);
}

app.listen(PORT, function () {
  var url = process.env.RENDER_EXTERNAL_URL || "http://localhost:" + PORT;
  console.log("JUJO Residence server on " + url);
});
