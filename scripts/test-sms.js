"use strict";

require("dotenv").config();
const { sendSms } = require("../lib/sms");
const { rentReminderText } = require("../lib/reminders");
const { normalizeKePhone } = require("../lib/phone");

const phoneRaw = process.argv[2] || "254758981679";
const phone = normalizeKePhone(phoneRaw);

if (!phone) {
  console.error("Invalid phone:", phoneRaw);
  process.exit(1);
}

const text = rentReminderText();

sendSms(phone, text).then(function (r) {
  if (r.mock) {
    console.log("SMS_MOCK is on — message logged, not sent to phone:");
    console.log("To:", phone);
    console.log("Text:", text);
    console.log("\nSet SMS_MOCK=0 and Africa's Talking keys in .env for a real SMS.");
  } else {
    console.log("Sent to", phone);
  }
});
