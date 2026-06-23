"use strict";

/**
 * Add a staff login (landlord, caretaker, accountant, or admin).
 *
 * Examples:
 *   node scripts/add-staff.js landlord boss@jujo.local MyPass123 "JUJO Owner"
 *   node scripts/add-staff.js caretaker care@mlolongo.local MyPass123 "Mlolongo Caretaker" mlolongo
 *   node scripts/add-staff.js caretaker care2@syokimau.local MyPass123 "Syokimau Caretaker" syokimau
 *   node scripts/add-staff.js caretaker both@jujo.local MyPass123 "Both sites" both
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { initDb, getDb } = require("../lib/db");

const ROLES = ["admin", "landlord", "caretaker", "accountant"];

function usage() {
  console.log(`
Usage:
  node scripts/add-staff.js <role> <email> <password> "Full name" [property]

Roles: admin, landlord, caretaker, accountant
Property (caretaker/accountant only): mlolongo | syokimau | both
`);
}

const role = (process.argv[2] || "").toLowerCase();
const email = (process.argv[3] || "").trim().toLowerCase();
const password = process.argv[4] || "";
const fullName = (process.argv[5] || "").trim();
const property = (process.argv[6] || "").toLowerCase();

if (!ROLES.includes(role) || !email || password.length < 8) {
  usage();
  process.exit(1);
}

initDb();
const db = getDb();

const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
if (exists) {
  console.error("That email is already in the database.");
  process.exit(1);
}

var ml = 0;
var sy = 0;
if (role === "admin" || role === "landlord") {
  ml = 1;
  sy = 1;
} else if (role === "caretaker" || role === "accountant") {
  if (property === "mlolongo") ml = 1;
  else if (property === "syokimau") sy = 1;
  else if (property === "both") {
    ml = 1;
    sy = 1;
  } else {
    console.error("Caretaker/accountant needs a property: mlolongo, syokimau, or both");
    usage();
    process.exit(1);
  }
}

const hash = bcrypt.hashSync(password, 10);
db.prepare(
  `INSERT INTO users (
     email, password_hash, role, property_id, full_name, approval_status,
     can_access_mlolongo, can_access_syokimau, is_superadmin
   ) VALUES (?, ?, ?, NULL, ?, 'active', ?, ?, ?)`
).run(email, hash, role, fullName || null, ml, sy, role === "admin" ? 1 : 0);

console.log("Created " + role + " login: " + email);
console.log("Sign in at http://localhost:3000/login.html");
