import { open } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BadRequestError } from "../errors/customErrors.js";
export const detectFileType = (buffer) => {
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return "image/jpeg";
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (buffer.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
};
export const validateUploadedFiles = async (files) => {
  const extensions = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "application/pdf": [".pdf"],
  };
  for (const [field, items] of Object.entries(files || {}))
    for (const file of items) {
      if (file.size > 5 * 1024 * 1024)
        throw new BadRequestError("File exceeds 5 MB");
      const handle = await open(file.path, "r");
      let type;
      try {
        const buffer = Buffer.alloc(16);
        await handle.read(buffer, 0, 16, 0);
        type = detectFileType(buffer);
      } finally {
        await handle.close();
      }
      if (
        !type ||
        type !== file.mimetype ||
        !extensions[type].includes(
          path.extname(file.originalname).toLowerCase(),
        ) ||
        (type === "application/pdf" && field !== "invoice")
      )
        throw new BadRequestError(
          "File content, extension and type must match",
        );
      if (type.startsWith("image/"))
        await sharp(file.path, { limitInputPixels: 25000000 }).metadata();
    }
};
