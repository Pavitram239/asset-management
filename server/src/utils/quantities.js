import { BadRequestError } from '../errors/customErrors.js';
export const quantity = (value, scale = 6, positive = false) => {
  if (!Number.isInteger(scale) || scale < 0 || scale > 6 || typeof value !== 'string' || !/^(0|[1-9]\d{0,13})(\.\d{1,6})?$/.test(value))
    throw new BadRequestError('Use a decimal quantity string with up to 14 integer and six fractional digits');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > scale) throw new BadRequestError(`This unit allows ${scale} fractional digits`);
  const result = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (positive && result === 0n) throw new BadRequestError('Quantity must be positive');
  return result;
};
export const quantityString = value => {
  const negative = value < 0n, absolute = negative ? -value : value;
  const fraction = (absolute % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${absolute / 1000000n}${fraction ? '.' + fraction : ''}`;
};
