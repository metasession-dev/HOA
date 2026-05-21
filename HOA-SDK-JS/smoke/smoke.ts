// Phase 9.3 smoke: exercises every resource helper against a live API.
// Usage:
//   HOA_API_BASE_URL=http://localhost:3003 HOA_API_TOKEN=<jwt> npx ts-node smoke/smoke.ts
import { HoaClient, HoaAPIError } from '../src';

async function main() {
  const client = new HoaClient({
    baseUrl: process.env.HOA_API_BASE_URL || 'http://localhost:3003',
  });

  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;
  if (email && password) {
    const login = await client.auth.login({ email, password });
    console.log('login ok ->', login.user.email);
  } else if (process.env.HOA_API_TOKEN) {
    client.setAccessToken(process.env.HOA_API_TOKEN);
    console.log('using HOA_API_TOKEN from env');
  } else {
    throw new Error('Set SMOKE_EMAIL + SMOKE_PASSWORD or HOA_API_TOKEN');
  }

  const org = await client.organizations.current();
  console.log('org ->', org.name, org.slug, org.currency);

  const estates = await client.estates.list();
  console.log('estates ->', estates.meta);

  // Units are scoped to an estate.
  if (estates.data.length > 0) {
    const units = await client.units.list({ estateId: estates.data[0].id });
    console.log('units ->', units.length, 'in estate', estates.data[0].name);
  } else {
    console.log('units -> skipped (no estate)');
  }

  const invoices = await client.invoices.list({ page: 1, limit: 5 });
  console.log('invoices page ->', invoices.meta);

  const requests = await client.requests.list({ page: 1, limit: 5 });
  console.log('requests page ->', requests.meta);

  const broadcasts = await client.broadcasts.list();
  console.log('broadcasts ->', broadcasts.length);

  // GraphQL
  const gql = await client.graphql.query<{ organization: { name: string } }>(
    '{ organization { name slug } }',
  );
  console.log('gql org ->', gql.organization.name);

  // Negative: bad token
  try {
    const bad = new HoaClient({ baseUrl: client.baseUrl, accessToken: 'invalid', maxRetries: 0 });
    await bad.organizations.current();
    throw new Error('expected auth failure');
  } catch (err) {
    if (err instanceof HoaAPIError && (err.status === 401 || err.status === 403)) {
      console.log('auth-error path ok ->', err.status, err.message);
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error('SMOKE FAIL:', err);
  process.exit(1);
});
