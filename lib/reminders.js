"use strict";

const cron = require("node-cron");
const { normalizeKePhone } = require("./phone");

function parsePhoneList(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(/[,;\s]+/)
    .map(function (s) {
      return normalizeKePhone(s.trim());
    })
    .filter(Boolean);
}

function startReminders(getDb, sendSms) {
  const tz = process.env.REMINDER_TZ || "Africa/Nairobi";

  // 09:00 on the 30th — remind tenants about rent + water before the 10th
  cron.schedule(
    "0 9 30 * *",
    function () {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT DISTINCT u.id, u.phone, p.slug
           FROM users u
           JOIN properties p ON p.id = u.property_id
           WHERE u.role = 'tenant'
             AND COALESCE(u.approval_status, 'active') = 'active'
             AND u.phone IS NOT NULL AND trim(u.phone) != ''`
        )
        .all();

      const template =
        process.env.REMINDER_TENANT_TEXT ||
        "JUJO Residence: Rent and water are due by the 10th. Open your tenant portal for exact amounts and M-Pesa paybill.";

      rows.forEach(function (r) {
        const phone = normalizeKePhone(r.phone);
        if (!phone) return;
        sendSms(phone, template).catch(function () {});
      });
    },
    { timezone: tz }
  );

  // 08:00 daily — nudge caretakers if registrations are still pending > 48h
  cron.schedule(
    "0 8 * * *",
    function () {
      const db = getDb();
      const pending = db
        .prepare(
          `SELECT u.id, u.property_id, p.slug
           FROM users u
           JOIN properties p ON p.id = u.property_id
           WHERE u.role = 'tenant'
             AND COALESCE(u.approval_status, 'active') = 'pending'
             AND (julianday('now') - julianday(u.created_at)) * 24 >= 48`
        )
        .all();

      if (!pending.length) return;

      const ml = parsePhoneList(process.env.CARETAKER_SMS_MLOLONGO || "");
      const sy = parsePhoneList(process.env.CARETAKER_SMS_SYOKIMAU || "");
      const msg =
        process.env.REMINDER_CARETAKER_TEXT ||
        "JUJO Residence: You have tenant registrations waiting activation. Please review the desk or ask the office admin.";

      const targets = new Set();
      pending.forEach(function (row) {
        if (row.slug === "mlolongo") ml.forEach(function (p) {
          targets.add(p);
        });
        if (row.slug === "syokimau") sy.forEach(function (p) {
          targets.add(p);
        });
      });
      targets.forEach(function (phone) {
        sendSms(phone, msg).catch(function () {});
      });
    },
    { timezone: tz }
  );
}

module.exports = { startReminders };
