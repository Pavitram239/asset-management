import test from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError } from 'axios';
import customFetch, { organizationKey } from '../src/utils/customFetch.js';
import { onboardingCommand } from '../src/utils/onboardingCommand.js';
import { uploadAttachment } from '../src/utils/attachmentCommand.js';

const storage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
};
const response = (config, data = {}) => ({ config, status: 200, statusText: 'OK', headers: {}, data: { data } });

test('workspace requests and command retries stay in their browser tab', async t => {
  const originalSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const originalLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalAdapter = customFetch.defaults.adapter;
  const alpha = storage(), gamma = storage(), shared = storage();
  const useTab = tab => Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: tab });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: shared });
  t.after(() => {
    customFetch.defaults.adapter = originalAdapter;
    for (const [key, descriptor] of [['sessionStorage', originalSession], ['localStorage', originalLocal]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  await t.test('switching Gamma does not retarget the prepared Alpha form', async () => {
    alpha.setItem(organizationKey, 'alpha');
    gamma.setItem(organizationKey, 'gamma');
    shared.setItem(organizationKey, 'gamma');
    const sent = [];
    customFetch.defaults.adapter = async config => { sent.push(config.headers.get('X-Organization-Id')); return response(config); };
    useTab(alpha);
    await customFetch.post('/access/departments', { code: 'ALPHA' });
    useTab(gamma);
    await customFetch.post('/access/departments', { code: 'GAMMA' });
    useTab(alpha);
    await customFetch.get('/access/management');
    assert.deepEqual(sent, ['alpha', 'gamma', 'alpha']);
  });

  await t.test('a tab without selection ignores the old shared selection', async () => {
    useTab(storage());
    customFetch.defaults.adapter = async config => {
      assert.equal(config.headers.has('X-Organization-Id'), false);
      return response(config);
    };
    await customFetch.get('/users/current-user');
  });

  await t.test('identity requests omit context and explicit company headers stay pinned', async () => {
    useTab(alpha);
    const sent = [];
    customFetch.defaults.adapter = async config => { sent.push(config.headers.get('X-Organization-Id')); return response(config); };
    await customFetch.post('/auth/recovery-requests', { email: 'synthetic@example.test' });
    await customFetch.post('/workspaces', {}, { identityContext: true });
    await customFetch.get('/products', { headers: { 'X-Organization-Id': 'explicit-company' } });
    assert.deepEqual(sent, [undefined, undefined, 'explicit-company']);
  });

  await t.test('a lost command response retries with the same company and idempotency key', async () => {
    useTab(alpha);
    const sent = [];
    customFetch.defaults.adapter = async config => {
      sent.push({ company: config.headers.get('X-Organization-Id'), key: config.headers.get('Idempotency-Key') });
      if (sent.length === 1) throw new AxiosError('Lost response', 'ERR_NETWORK', config);
      return response(config, { id: 'recovered' });
    };
    const command = () => onboardingCommand('createFixture', '/fixtures', { name: 'Example' }, 'synthetic-user');
    await assert.rejects(command(), /Lost response/);
    useTab(gamma);
    gamma.setItem(organizationKey, 'another-company');
    useTab(alpha);
    assert.deepEqual(await command(), { id: 'recovered' });
    assert.equal(sent[0].company, 'alpha');
    assert.deepEqual(sent[1], sent[0]);
  });

  await t.test('file staging and linking retain Alpha when another tab switches', async () => {
    useTab(alpha);
    const sent = [];
    customFetch.defaults.adapter = async config => {
      sent.push(config.headers.get('X-Organization-Id'));
      gamma.setItem(organizationKey, 'gamma');
      return response(config, config.url === '/attachments' ? { id: 'file-fixture', version: 1, status: 'staged' } : { id: 'file-fixture', status: 'linked' });
    };
    const result = await uploadAttachment(new File(['synthetic'], 'fixture.txt', { type: 'text/plain' }), { targetType: 'catalog', targetId: 'synthetic-item', category: 'image' }, 'synthetic-user');
    assert.equal(result.status, 'linked');
    assert.deepEqual(sent, ['alpha', 'alpha']);
  });

  await t.test('an expired session clears only the requesting tab selection', async () => {
    useTab(alpha);
    customFetch.defaults.adapter = async config => { throw new AxiosError('Expired', 'ERR_BAD_REQUEST', config, null, { status: 401 }); };
    await assert.rejects(customFetch.get('/users/current-user'));
    assert.equal(alpha.getItem(organizationKey), null);
    assert.equal(gamma.getItem(organizationKey), 'gamma');
    assert.equal(shared.getItem(organizationKey), 'gamma');
  });
});
