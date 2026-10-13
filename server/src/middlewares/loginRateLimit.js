// Per-process protection. A multi-instance deployment needs a shared store.
export const createLoginRateLimit = ({ windowMs = 15 * 60 * 1000, max = 15, now = Date.now } = {}) => {
  const attempts = new Map();
  return (req, res, next) => {
    const time = now();
    for (const [key, value] of attempts) if (value.reset <= time) attempts.delete(key);
    const key = req.ip;
    let bucket = attempts.get(key);
    if (!bucket) {
      if (attempts.size >= 10000) return res.status(429).json({ msg: 'Please try again later' });
      bucket = { count: 0, reset: time + windowMs };
      attempts.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.reset - time) / 1000)));
      return res.status(429).json({ msg: 'Too many attempts. Please try again later.' });
    }
    next();
  };
};
