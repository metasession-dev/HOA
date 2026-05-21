# hoa-africa

Official Python SDK for the [HOA.africa](https://hoa.africa) API.

Requires Python 3.9+.

## Install

```bash
pip install hoa-africa
```

## Usage

```python
from hoa_africa import HoaClient

client = HoaClient(
    base_url="https://api.hoa.africa",
    # Either:
    api_key="hoa_live_...",
    # or:
    # access_token="<JWT from /api/auth/login>",
)

org = client.organizations.current()
invoices = client.invoices.list(page=1, limit=20, status="pending")

# Anything not covered by a helper:
people = client.request("GET", "/api/people", query={"type": "owner"})

# GraphQL
data = client.graphql.query("""
  query Dashboard {
    invoices(page: 1, limit: 5) { data { id amount status } meta { total } }
  }
""")
```

## Auth

Pass exactly one of:

- `access_token` — JWT from `POST /api/auth/login`. For end-user apps.
- `api_key` — Platform API key from `/api/platform/api-keys`. For server-to-server integrations.

Or set `HOA_API_TOKEN` / `HOA_API_KEY` in the environment.

## Retries + rate limits

- 429 + 5xx are retried up to `max_retries` times (default 2) with exponential backoff.
- 429 honours the `Retry-After` and `X-RateLimit-Reset` headers.
- Exhausted retries surface as `HoaRateLimitError`.

## Errors

```python
from hoa_africa import HoaAPIError, HoaAuthError, HoaRateLimitError

try:
    client.invoices.create({...})
except HoaAuthError as e:
    print("auth failed", e.status, e.code)
except HoaRateLimitError as e:
    print("retry after", e.retry_after_seconds)
except HoaAPIError as e:
    print("api error", e.status, e.body)
```

## Idempotency

State-changing endpoints accept an `Idempotency-Key`:

```python
import uuid
client.invoices.create(payload, idempotency_key=str(uuid.uuid4()))
```

## License

Apache-2.0
