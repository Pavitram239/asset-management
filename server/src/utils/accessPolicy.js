import { BadRequestError } from '../errors/customErrors.js';
import { PRODUCT_STATUS, WARRANTY_STATUS } from './constants.js';
export const isUUID = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const pickProfileFields = (body) => Object.fromEntries(
  ['name', 'firstName', 'email', 'location'].filter((key) => typeof body[key] === 'string')
    .map((key) => [key, body[key].trim()])
);

export const assetInput = (body, user, partial = false) => {
  const fields = ['name', 'company', 'purchaseDate', 'warrantyDate', 'assignedToId',
    'status', 'department', 'customerCare', 'power', 'capacity', 'serialNumber'];
  const data = {};
  for (const key of fields) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string' || body[key].length > 500)
      throw new BadRequestError(`Invalid ${key}`);
    data[key] = body[key].trim();
  }
  for (const key of ['name', 'company']) {
    if ((!partial || key in data) && !data[key]) throw new BadRequestError(`${key} is required`);
  }
  if (data.status && !Object.values(PRODUCT_STATUS).includes(data.status))
    throw new BadRequestError('Invalid asset status');
  if (data.assignedToId && !isUUID(data.assignedToId)) throw new BadRequestError('Invalid assigned user ID');
  if (!partial && !data.department) throw new BadRequestError('Department is required');
  for (const key of ['purchaseDate', 'warrantyDate']) {
    if (!(key in data)) continue;
    if (data[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(data[key]) || Number.isNaN(Date.parse(data[key])) || new Date(data[key]).toISOString().slice(0,10)!==data[key])) throw new BadRequestError(`Invalid ${key}`);
    if (key === 'warrantyDate') data.warranty = data[key] && data[key] > new Date().toISOString().slice(0,10)
      ? WARRANTY_STATUS.ACTIVE : WARRANTY_STATUS.EXPIRED;
    if (!data[key]) data[key] = null;
  }
  return data;
};

export const pagination = (query) => {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 10);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new BadRequestError('Page must be positive and limit must be between 1 and 100');
  return { page, limit, skip: (page - 1) * limit };
};
