// Unit tests for HoaClient — fetch is stubbed, no live API needed.
// Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HoaClient, HoaAuthError, HoaRateLimitError, HoaAPIError } from '../dist/index.js';

function stubFetch(responses) {
  let i = 0;
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const r = responses[i++] ?? responses[responses.length - 1];
    return new Response(r.body ?? '', {
      status: r.status,
      headers: { 'content-type': 'application/json', ...(r.headers ?? {}) },
    });
  };
  fn.calls = calls;
  return fn;
}

test('unwraps { success, data } envelope', async () => {
  const fetch = stubFetch([
    { status: 200, body: JSON.stringify({ success: true, data: { id: 'org_1', name: 'X', slug: 'x', currency: 'ZAR', country: 'ZA', timezone: 'UTC', language: 'en', createdAt: '2026-01-01' } }) },
  ]);
  const c = new HoaClient({ baseUrl: 'http://x', accessToken: 't', fetch, maxRetries: 0 });
  const org = await c.organizations.current();
  assert.equal(org.name, 'X');
});

test('sends Authorization header for JWT', async () => {
  const fetch = stubFetch([{ status: 200, body: JSON.stringify({ success: true, data: [] }) }]);
  const c = new HoaClient({ baseUrl: 'http://x', accessToken: 'abc', fetch, maxRetries: 0 });
  await c.estates.list();
  assert.equal(fetch.calls[0].init.headers['Authorization'], 'Bearer abc');
});

test('sends X-API-Key header for API key', async () => {
  const fetch = stubFetch([{ status: 200, body: JSON.stringify({ success: true, data: [] }) }]);
  const c = new HoaClient({ baseUrl: 'http://x', apiKey: 'hoa_live_xyz', fetch, maxRetries: 0 });
  await c.estates.list();
  assert.equal(fetch.calls[0].init.headers['X-API-Key'], 'hoa_live_xyz');
});

test('throws HoaAuthError on 401', async () => {
  const fetch = stubFetch([{ status: 401, body: JSON.stringify({ message: 'no', error: 'Unauthorized' }) }]);
  const c = new HoaClient({ baseUrl: 'http://x', accessToken: 't', fetch, maxRetries: 0 });
  await assert.rejects(() => c.organizations.current(), (e) => e instanceof HoaAuthError && e.status === 401);
});

test('throws HoaRateLimitError on 429 after retries exhausted', async () => {
  const fetch = stubFetch([{ status: 429, headers: { 'retry-after': '0' }, body: JSON.stringify({ message: 'slow down' }) }]);
  const c = new HoaClient({ baseUrl: 'http://x', accessToken: 't', fetch, maxRetries: 1 });
  await assert.rejects(() => c.organizations.current(), (e) => e instanceof HoaRateLimitError);
});

test('retries 5xx and succeeds', async () => {
  const fetch = stubFetch([
    { status: 503, body: JSON.stringify({ message: 'down' }) },
    { status: 200, body: JSON.stringify({ success: true, data: { id: 'o', name: 'Y', slug: 'y', currency: 'ZAR', country: 'ZA', timezone: 'UTC', language: 'en', createdAt: 'd' } }) },
  ]);
  const c = new HoaClient({ baseUrl: 'http://x', accessToken: 't', fetch, maxRetries: 1 });
  const org = await c.organizations.current();
  assert.equal(org.name, 'Y');
  assert.equal(fetch.calls.length, 2);
});

test('passes Idempotency-Key', async () => {
  const fetch = stubFetch([{ status: 201, body: JSON.stringify({ success: true, data: { id: 'i', invoiceNumber: 'INV-1', type: 'levy', amount: '100.00', currency: 'ZAR', status: 'pending', dueDate: 'd', paidAt: null, sentAt: null, unitId: 'u', createdAt: 'd' } }) }]);
  const c = new HoaClient({ baseUrl: 'http://x', accessToken: 't', fetch, maxRetries: 0 });
  await c.invoices.create({ unitId: 'u', type: 'levy', amount: '100.00', dueDate: '2026-01-01' }, { idempotencyKey: 'idem-1' });
  assert.equal(fetch.calls[0].init.headers['Idempotency-Key'], 'idem-1');
});

test('builds query string from query object', async () => {
  const fetch = stubFetch([{ status: 200, body: JSON.stringify({ success: true, data: [], meta: { total: 0, page: 1, limit: 5, totalPages: 0 } }) }]);
  const c = new HoaClient({ baseUrl: 'http://x', accessToken: 't', fetch, maxRetries: 0 });
  await c.invoices.list({ page: 1, limit: 5, status: 'pending' });
  const url = new URL(fetch.calls[0].url);
  assert.equal(url.searchParams.get('page'), '1');
  assert.equal(url.searchParams.get('limit'), '5');
  assert.equal(url.searchParams.get('status'), 'pending');
});

test('rejects when both accessToken and apiKey are passed', () => {
  assert.throws(() => new HoaClient({ accessToken: 'a', apiKey: 'b' }));
});

test('graphql.query unwraps data', async () => {
  const fetch = stubFetch([{ status: 200, body: JSON.stringify({ data: { organization: { name: 'X' } } }) }]);
  const c = new HoaClient({ baseUrl: 'http://x', accessToken: 't', fetch, maxRetries: 0 });
  const out = await c.graphql.query('{ organization { name } }');
  assert.deepEqual(out, { organization: { name: 'X' } });
});
