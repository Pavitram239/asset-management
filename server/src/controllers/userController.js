import { users } from '../repositories/users.js';
import { products } from '../repositories/products.js';
import { v2 as cloudinary } from 'cloudinary';
import { promises as fs } from 'node:fs';
import { pickProfileFields } from '../utils/accessPolicy.js';

export const getCurrentUser = async (req, res) =>
  res.status(200).json({ user: await users.findById(req.user.userId) });

export const getApplicationStats = async (req, res) => {
  const department = req.user.role === 'admin' ? undefined : req.user.department;
  const [userCount, productCount] = await Promise.all([users.count(department), products.count({ department })]);
  res.status(200).json({ users: userCount, products: productCount });
};

export const getUsersList = async (req, res) =>
  res.status(200).json({ users: await users.list(req.user.role === 'admin' ? undefined : req.user.department) });

export const getDepartmentList = async (req, res) =>
  res.status(200).json({ departments: await users.departments(req.user.role === 'admin' ? undefined : req.user.department) });

export const updateUser = async (req, res) => {
  const input = pickProfileFields(req.body);
  const previous = await users.findById(req.user.userId);
  if (req.file) {
    const response = await cloudinary.uploader.upload(req.file.path);
    await fs.unlink(req.file.path);
    input.avatar = response.secure_url;
    input.avatarPublicId = response.public_id;
  }
  await users.update(req.user.userId, input);
  if (req.file && previous.avatarPublicId) await cloudinary.uploader.destroy(previous.avatarPublicId);
  res.status(200).json({ msg: 'Updated user' });
};
