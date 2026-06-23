"use strict";

const { normalizeKePhone } = require("./phone");

function totalDueCents(row) {
  return Number(row.amount_cents) + (Number(row.water_amount_cents) || 0);
}

function markRentPaid(db, rentId, receipt, source) {
  const row = db
    .prepare(
      `SELECT id, user_id, status FROM rent_records WHERE id = ?`
    )
    .get(rentId);
  if (!row || row.status === "paid") {
    return { ok: false, reason: "not_found_or_paid" };
  }
  db.prepare(
    `UPDATE rent_records
     SET status = 'paid', paid_at = datetime('now'), mpesa_receipt = ?
     WHERE id = ?`
  ).run(receipt || null, rentId);
  return { ok: true, rentId: row.id, userId: row.user_id, source: source };
}

function parseRentRef(billRef) {
  if (!billRef) return null;
  const s = String(billRef).trim();
  let m = s.match(/^R(\d+)$/i);
  if (m) return Number(m[1]);
  m = s.match(/^rent[-_]?(\d+)$/i);
  if (m) return Number(m[1]);
  return null;
}

/** Match manual Paybill payment to a tenant rent line. */
function matchC2bPayment(db, opts) {
  const amountCents = Math.round(Number(opts.amount) * 100);
  if (!amountCents || amountCents < 1) return null;

  const rentId = parseRentRef(opts.billRef);
  if (rentId) {
    const row = db
      .prepare(
        `SELECT r.id, r.user_id, r.amount_cents, r.water_amount_cents, r.status
         FROM rent_records r WHERE r.id = ?`
      )
      .get(rentId);
    if (row && row.status !== "paid" && totalDueCents(row) === amountCents) {
      return row;
    }
  }

  const phone = normalizeKePhone(opts.phone || "");
  if (!phone) return null;

  const tenants = db
    .prepare(
      `SELECT id, house_number FROM users
       WHERE role = 'tenant' AND phone = ? AND COALESCE(approval_status, 'active') = 'active'`
    )
    .all(phone);

  if (!tenants.length && opts.billRef) {
    const byUnit = db
      .prepare(
        `SELECT id, house_number FROM users
         WHERE role = 'tenant' AND house_number = ? AND COALESCE(approval_status, 'active') = 'active'`
      )
      .get(String(opts.billRef).trim());
    if (byUnit) tenants.push(byUnit);
  }

  for (let i = 0; i < tenants.length; i++) {
    const due = db
      .prepare(
        `SELECT id, user_id, amount_cents, water_amount_cents, status
         FROM rent_records
         WHERE user_id = ? AND status IN ('due', 'late')
         ORDER BY datetime(due_date) ASC`
      )
      .all(tenants[i].id);
    for (let j = 0; j < due.length; j++) {
      if (totalDueCents(due[j]) === amountCents) {
        return due[j];
      }
    }
  }
  return null;
}

function recordPayment(db, row) {
  db.prepare(
    `INSERT INTO mpesa_payments (
       rent_record_id, user_id, phone, amount_cents, checkout_request_id,
       merchant_request_id, mpesa_receipt, status, source, raw_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.rentRecordId || null,
    row.userId || null,
    row.phone || null,
    row.amountCents,
    row.checkoutRequestId || null,
    row.merchantRequestId || null,
    row.mpesaReceipt || null,
    row.status,
    row.source,
    row.rawJson || null
  );
}

module.exports = {
  totalDueCents,
  markRentPaid,
  parseRentRef,
  matchC2bPayment,
  recordPayment,
};
