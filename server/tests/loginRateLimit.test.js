import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoginRateLimit } from '../src/middlewares/loginRateLimit.js';

test('authentication throttling isolates clients and expires attempts', () => {
  let time = 0;
  const limit = createLoginRateLimit({ windowMs: 1000, max: 2, now: () => time });
  const call = (ip) => {
    const result = { status: 200, headers: {}, next: false };
    const res = {
      setHeader: (key, value) => { result.headers[key] = value; },
      status: (status) => { result.status = status; return res; },
      json: (body) => { result.body = body; },
    };
    limit({ ip }, res, () => { result.next = true; });
    return result;
  };
  assert.equal(call('a').next, true);
  assert.equal(call('a').next, true);
  const blocked = call('a');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['Retry-After'], '1');
  assert.equal(call('b').next, true);
  time = 1000;
  assert.equal(call('a').next, true);
});
