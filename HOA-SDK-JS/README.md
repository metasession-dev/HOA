# @hoa-africa/sdk

Official JavaScript / TypeScript SDK for the [HOA.africa](https://hoa.africa) API.

Works in Node.js 18+, modern browsers, and edge runtimes (Cloudflare Workers, Vercel Edge, Deno).

## Install

```bash
npm install @hoa-africa/sdk
```

## Usage

```ts
import { HoaClient } from '@hoa-africa/sdk';

const client = new HoaClient({
  baseUrl: 'https://api.hoa.africa',
  // Either:
  apiKey: process.env.HOA_API_KEY,
  // or:
  // accessToken: '<JWT from /api/auth/login>',
});

const org = await client.organizations.current();
const invoices = await client.invoices.list({ page: 1, limit: 20, status: 'pending' });

// Resource not yet covered by a helper? Use the raw request:
const customers = await client.request('GET', '/api/people', { query: { type: 'owner' } });

// GraphQL
const data = await client.graphql.query(`
  query Dashboard {
    invoices(page: 1, limit: 5) { data { id amount status } meta { total } }
  }
`);
```

## Auth

The SDK supports two auth modes — pass **one**:

- `accessToken` — JWT issued by `POST /api/auth/login`. Use for end-user apps.
- `apiKey` — Platform API key (`hoa_live_...`) minted from `/api/platform/api-keys`. Use for server-to-server integrations.

Both can be supplied via env: `HOA_API_TOKEN`, `HOA_API_KEY`.

## Retries + rate limits

- `429` and `5xx` are retried up to `maxRetries` times (default 2) with exponential backoff.
- `429` honours the `X-RateLimit-Reset` and `Retry-After` response headers when present.
- After the retry budget is exhausted, the SDK throws `HoaRateLimitError`.

## Errors

```ts
import { HoaAPIError, HoaAuthError, HoaRateLimitError } from '@hoa-africa/sdk';

try {
  await client.invoices.create({ /* ... */ });
} catch (err) {
  if (err instanceof HoaAuthError) /* 401 / 403 */;
  else if (err instanceof HoaRateLimitError) /* retry exhausted */;
  else if (err instanceof HoaAPIError) console.error(err.status, err.body);
  else throw err;
}
```

## Idempotency

State-changing endpoints accept an `Idempotency-Key`:

```ts
await client.invoices.create(invoice, { idempotencyKey: crypto.randomUUID() });
```

The server stores the response for 24h — retrying with the same key returns the original response.

## License

Apache-2.0
