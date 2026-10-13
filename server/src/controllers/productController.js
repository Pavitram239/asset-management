import { randomUUID } from 'node:crypto';
import qrcode from 'qrcode';
import { products } from '../repositories/products.js';
import { users } from '../repositories/users.js';
import { saveFile, deleteFile } from '../utils/fileOps.js';
import { assetInput, pagination, isUUID } from '../utils/accessPolicy.js';
import { PRODUCT_STATUS, WARRANTY_STATUS } from '../utils/constants.js';
import { BadRequestError } from '../errors/customErrors.js';

const departmentScope = (user) => user.role === 'admin' ? undefined : user.department;
const assignment = async (input, department) => {
  if (!('assignedToId' in input) || !input.assignedToId) return;
  if (!isUUID(input.assignedToId)) throw new BadRequestError('Invalid assigned user ID');
  const user = await users.findById(input.assignedToId);
  if (!user || user.department !== department)
    throw new BadRequestError('Assigned user must belong to the asset department');
};
const uploadFiles = async (files, id) => {
  const fields = {};
  if (files?.productImg) fields.productImg = await saveFile(files.productImg[0], 'assets', 'images', id);
  if (files?.invoice) fields.invoice = await saveFile(files.invoice[0], 'assets', 'invoices', id);
  return fields;
};

export const getAllProducts = async (req, res) => {
  const { search, productStatus, productWarranty, sort } = req.query;
  if (search !== undefined && (typeof search !== 'string' || search.length > 200))
    throw new BadRequestError('Search must be at most 200 characters');
  if (productStatus && productStatus !== 'all' && !Object.values(PRODUCT_STATUS).includes(productStatus))
    throw new BadRequestError('Invalid status filter');
  if (productWarranty && productWarranty !== 'all' && !Object.values(WARRANTY_STATUS).includes(productWarranty))
    throw new BadRequestError('Invalid warranty filter');
  const filters = { department: departmentScope(req.user), search,
    status: productStatus === 'all' ? undefined : productStatus,
    warrantyStatus: productWarranty === 'all' ? undefined : productWarranty };
  const paging = pagination(req.query);
  const [items, totalProducts] = await Promise.all([
    products.list(filters, paging, sort), products.count(filters),
  ]);
  res.status(200).json({ products: items, totalProducts, numOfPages: Math.ceil(totalProducts / paging.limit), currentPage: paging.page });
};

export const createProduct = async (req, res) => {
  const input = assetInput(req.body, req.user);
  await assignment(input, input.department);
  input._id = randomUUID();
  input.creator = req.user.userId;
  input.createdBy = req.user.name;
  input.qr = await qrcode.toDataURL(input._id, { errorCorrectionLevel: 'H', margin: 1, width: 300 });
  Object.assign(input, await uploadFiles(req.files, input._id));
  const product = await products.create(input);
  res.status(201).json({ product });
};

export const getProduct = async (req, res) => res.status(200).json({ product: req.product });

export const updateProduct = async (req, res) => {
  const input = assetInput(req.body, req.user, true);
  const department = input.department || req.product.department;
  if (department !== req.product.department && !('assignedToId' in input))
    input.assignedToId = ''; // A transfer cannot retain an owner from the previous department.
  await assignment(input, department);
  Object.assign(input, await uploadFiles(req.files, req.params.id));
  const updatedProduct = await products.update(req.params.id, input);
  res.status(200).json({ message: 'Product Updated', updatedProduct });
};

export const getOverview = async (req, res) =>
  res.status(200).json(await products.overview(departmentScope(req.user)));

export const deleteProduct = async (req, res) => {
  const product = req.product;
  if (product.productImg) await deleteFile('assets', 'images', product._id);
  if (product.invoice) await deleteFile('assets', 'invoices', product._id);
  const removedProduct = await products.remove(req.params.id);
  res.status(200).json({ message: 'Product deleted', removedProduct });
};
