import multer from "multer";
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BadRequestError } from '../errors/customErrors.js';

const uploadDirectory = path.join(tmpdir(), 'asset-management-uploads');
mkdirSync(uploadDirectory, { recursive: true });

export const cleanupUploads = (req, res, next) => {
  res.on('finish', () => {
    const files = [...Object.values(req.files || {}).flat(), ...(req.file ? [req.file] : [])];
    for (const file of files) unlink(file.path).catch(() => {});
  });
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
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (file.fieldname === 'invoice') allowed.push('application/pdf');
    cb(allowed.includes(file.mimetype) ? null : new BadRequestError('Upload JPEG, PNG, WebP images or PDF invoices'), allowed.includes(file.mimetype));
  },
});

export default upload;
