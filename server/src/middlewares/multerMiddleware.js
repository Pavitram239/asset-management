import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BadRequestError } from "../errors/customErrors.js";

const uploadDirectory = path.join(tmpdir(), "asset-management-uploads");
mkdirSync(uploadDirectory, { recursive: true });

export const cleanupUploads = (req, res, next) => {
  const cleanup = () => {
    const files = [
      ...Object.values(req.files || {}).flat(),
      ...(req.file ? [req.file] : []),
    ];
    for (const file of files) unlink(file.path).catch(() => {});
  };
  res.once("finish", cleanup);
  res.once("close", cleanup);
  next();
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDirectory);
  },
  filename: function (req, file, cb) {
    const fileName = randomUUID();
    cb(null, fileName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 2, fields: 25, fieldSize: 2048 },
  fileFilter(req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (["invoice","file"].includes(file.fieldname)) allowed.push("application/pdf");
    cb(
      allowed.includes(file.mimetype)
        ? null
        : new BadRequestError("Upload JPEG, PNG, WebP images or PDF invoices"),
      allowed.includes(file.mimetype),
    );
  },
});

export default upload;
// Same private temporary storage and bounds; the staging endpoint accepts one file.
export const attachmentUpload=multer({storage,limits:{fileSize:5*1024*1024,files:1,fields:0},fileFilter(req,file,cb){
  const valid=['image/jpeg','image/png','image/webp','application/pdf'].includes(file.mimetype);
  cb(valid?null:new BadRequestError('Upload JPEG, PNG, WebP or PDF files'),valid);
}}).single('file');
