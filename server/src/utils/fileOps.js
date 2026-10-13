import { promises as fs } from "fs";
import { removeFile, uploadFile } from "./firebase/firebaseFileOps.js";
import sharp from "sharp";
export const saveFile = async (file, department, type, name) => {
  try {
    if (type === "images") {
      const compressedBuffer = await sharp(file.path)
        .resize(300)
        .jpeg({ quality: 30 })
        .toBuffer();
      await fs.writeFile(file.path, compressedBuffer);
      file.mimetype = 'image/jpeg';
    }
    return await uploadFile(file, department, type, name);
  } finally {
    await fs.unlink(file.path).catch(() => {});
  }
};

export const deleteFile = async (department, type, name) => {
  await removeFile(department, type, name);
};
