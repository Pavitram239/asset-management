import { BadRequestError } from '../errors/customErrors.js';

export const companySettings = (body) => {
  const result = {};
  if (Object.hasOwn(body, 'currency')) {
    if (typeof body.currency !== 'string' || !Intl.supportedValuesOf('currency').includes(body.currency))
      throw new BadRequestError('Choose a supported currency');
    result.currency = body.currency;
  }
  if (Object.hasOwn(body, 'timeZone')) {
    if (typeof body.timeZone !== 'string' || body.timeZone.length > 100 ||
      !(body.timeZone === 'UTC' || body.timeZone.includes('/')))
      throw new BadRequestError('Choose an IANA time zone such as Asia/Kolkata');
    try { new Intl.DateTimeFormat('en', {timeZone: body.timeZone}).format(); }
    catch { throw new BadRequestError('Choose a valid IANA time zone'); }
    result.timeZone = body.timeZone;
  }
  return result;
};

export const expectedVersion = (value, actual) => {
  if (!Number.isSafeInteger(value) || value < 1) throw new BadRequestError('A current expectedVersion is required');
  if (value !== Number(actual)) {
    const error = new Error('This workspace changed. Reload it before saving.');
    error.statusCode = 409; error.apiCode = 'VERSION_CONFLICT'; throw error;
  }
};
