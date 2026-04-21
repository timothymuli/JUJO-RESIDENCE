"use strict";

require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");

const { initDb, getDb } = require("./lib/db");
const { normalizeKePhone } = require("./lib/phone");
const { sendSms } = require("./lib/sms");

initDb();
const db = getDb();

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
      account: process.env.BLESSED_MPESA_ACCOUNT || "",
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
              COALESCE(approval_status, 'active') AS approval_status
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

  const user = db
    .prepare(
      `SELECT id, email, role, property_id, full_name,
              COALESCE(approval_status, 'active') AS approval_status
       FROM users WHERE id = ?`
    )
    .get(req.session.uid);

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
    },
    property,
    mpesa,
  });
});

app.get("/api/maintenance", requireLogin, function (req, res) {
  if (req.session.role === "admin") {
    const rows = db
      .prepare(
        `SELECT m.id, m.title, m.description, m.status, m.created_at,
                p.slug AS property_slug, p.name AS property_name,
                u.email AS tenant_email
         FROM maintenance_requests m
         JOIN properties p ON p.id = m.property_id
         JOIN users u ON u.id = m.user_id
         ORDER BY datetime(m.created_at) DESC`
      )
      .all();
    return res.json({ ok: true, requests: rows });
  }

  if (req.session.role !== "tenant") {
    return jsonErr(res, 403, "Not allowed.");
  }

  const rows = db
    .prepare(
      `SELECT m.id, m.title, m.description, m.status, m.created_at,
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

  if (!title) {
    return jsonErr(res, 400, "Title is required.");
  }

  const info = db
    .prepare(
      `INSERT INTO maintenance_requests (property_id, user_id, title, description)
       VALUES (?, ?, ?, ?)`
    )
    .run(pid, req.session.uid, title, description || null);

  res.json({ ok: true, id: info.lastInsertRowid });
});

app.patch("/api/maintenance/:id", requireAdmin, function (req, res) {
  const id = Number(req.params.id);
  const status = (req.body.status || "").trim();

  if (!["open", "in_progress", "done"].includes(status)) {
    return jsonErr(res, 400, "Invalid status.");
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
  if (req.session.role === "admin") {
    const rows = db
      .prepare(
        `SELECT r.id, r.label, r.amount_cents, r.due_date, r.paid_at, r.status,
                u.email AS tenant_email, p.slug AS property_slug, p.name AS property_name
         FROM rent_records r
         JOIN users u ON u.id = r.user_id
         JOIN properties p ON p.id = r.property_id
         ORDER BY datetime(r.due_date) DESC`
      )
      .all();
    return res.json({ ok: true, records: rows });
  }

  const rows = db
    .prepare(
      `SELECT id, label, amount_cents, due_date, paid_at, status
       FROM rent_records
       WHERE user_id = ?
       ORDER BY datetime(due_date) DESC`
    )
    .all(req.session.uid);

  res.json({ ok: true, records: rows });
});

app.post("/api/rent/record", requireAdmin, function (req, res) {
  const userId = Number(req.body.user_id);
  const propertyId = Number(req.body.property_id);
  const label = (req.body.label || "").trim();
  const amountCents = Number(req.body.amount_cents);
  const dueDate = (req.body.due_date || "").trim();
  const paid = Boolean(req.body.paid);

  if (!userId || !propertyId || !label || !dueDate || !Number.isFinite(amountCents)) {
    return jsonErr(res, 400, "Missing or invalid fields.");
  }

  const paidAt = paid ? new Date().toISOString().slice(0, 19).replace("T", " ") : null;
  const status = paid ? "paid" : "due";

  db.prepare(
    `INSERT INTO rent_records (user_id, property_id, label, amount_cents, due_date, paid_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, propertyId, label, amountCents, dueDate, paidAt, status);

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
  db.prepare(
    `INSERT INTO users (email, password_hash, role, property_id, full_name, phone, approval_status)
     VALUES (?, ?, 'tenant', ?, ?, NULL, 'active')`
  ).run(email, hash, propertyId, fullName || null);

  res.json({ ok: true });
});

app.get("/api/admin/users", requireAdmin, function (req, res) {
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.full_name, u.phone, u.property_id,
              COALESCE(u.approval_status, 'active') AS approval_status,
              p.slug AS property_slug, p.name AS property_name
       FROM users u
       LEFT JOIN properties p ON p.id = u.property_id
       WHERE u.role = 'tenant'
       ORDER BY u.email`
    )
    .all();
  res.json({ ok: true, users: rows });
});

app.get("/api/admin/pending-tenants", requireAdmin, function (req, res) {
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.full_name, u.phone, u.created_at,
              p.slug AS property_slug, p.name AS property_name
       FROM users u
       JOIN properties p ON p.id = u.property_id
       WHERE u.role = 'tenant' AND COALESCE(u.approval_status, 'active') = 'pending'
       ORDER BY u.id DESC`
    )
    .all();
  res.json({ ok: true, tenants: rows });
});

app.post("/api/admin/users/:id/approve", requireAdmin, function (req, res) {
  const id = Number(req.params.id);
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

app.get("/api/admin/messages", requireAdmin, function (req, res) {
  const rows = db
    .prepare(
      `SELECT id, property_slug, name, email, message, created_at
       FROM contact_messages
       ORDER BY datetime(created_at) DESC
       LIMIT 100`
    )
    .all();
  res.json({ ok: true, messages: rows });
});

app.use(express.static(path.join(__dirname, "public")));

app.use(function (req, res) {
  if (req.path.startsWith("/api/")) {
    return jsonErr(res, 404, "Not found.");
  }
  res.status(404).send("Not found.");
});

app.listen(PORT, function () {
  console.log("JUJO Residence server on http://localhost:" + PORT);
});
