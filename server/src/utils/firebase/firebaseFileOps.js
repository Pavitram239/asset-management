import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import app from "./firebase.js";
import { promises as fs } from "fs";

export const uploadFile = async (file, folder, type, name) => {
  const storageRef = ref(getStorage(app), `${folder}/${type}/${name}`);
  const data = await fs.readFile(file.path);
  const snapshot = await uploadBytes(storageRef, data, { contentType: file.mimetype });
  return getDownloadURL(snapshot.ref);
};

export const removeFile = async (department, type, name) => {
  const storage = getStorage(app);

  // Create a reference to the file to delete

  const desertRef = ref(storage, `${department}/${type}/` + name);

  // Delete the file
  try { await deleteObject(desertRef); }
  catch (error) { if (error.code !== 'storage/object-not-found') throw error; }
};
