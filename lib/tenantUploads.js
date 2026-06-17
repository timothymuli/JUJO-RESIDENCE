"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const ALLOWED = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

function uploadDirRoot() {
  return path.join(__dirname, "..", "data", "uploads", "tenant-docs");
}

function ensureUploadDir() {
  fs.mkdirSync(uploadDirRoot(), { recursive: true });
}

function makeStorage() {
  return multer.diskStorage({
    destination: function (_req, _file, cb) {
      ensureUploadDir();
      cb(null, uploadDirRoot());
    },
    filename: function (_req, file, cb) {
      const ext = ALLOWED[file.mimetype];
      if (!ext) {
        return cb(new Error("Invalid file type."));
      }
      cb(null, crypto.randomBytes(24).toString("hex") + ext);
    },
  });
}

function fileFilter(_req, file, cb) {
  if (ALLOWED[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, JPEG, or PNG files are allowed."));
  }
}

const tenantDocUpload = multer({
  storage: makeStorage(),
  fileFilter: fileFilter,
  limits: { fileSize: Number(process.env.TENANT_UPLOAD_MAX_BYTES) || 12 * 1024 * 1024 },
});

module.exports = {
  uploadDirRoot,
  ensureUploadDir,
  tenantDocUpload,
  ALLOWED,
};
