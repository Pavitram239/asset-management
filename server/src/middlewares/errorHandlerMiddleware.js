import { StatusCodes } from "http-status-codes";

const errorHandlerMiddleware = (err, req, res, next) => {
  if (err.code === '23505') return res.status(409).json({ msg: 'Email or unique record already exists' });
  if (['23503', '23514', '23502', '22P02', '22007', '22008', '22001'].includes(err.code))
    return res.status(400).json({ msg: 'Invalid record values or references' });
  const statusCode = err.statusCode || (err.name === 'MulterError' || err.name === 'ValidationError' ? 400 : StatusCodes.INTERNAL_SERVER_ERROR);
  if (statusCode >= 500) console.error('Request failed:', err.message);
  const msg = statusCode >= 500 ? 'Something went wrong, please try again later' : err.message;
  res.status(statusCode).json({ msg: msg });
};

export default errorHandlerMiddleware;
