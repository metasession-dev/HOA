import { HoaAPIError, HoaAuthError, HoaRateLimitError } from './errors';
import type {
  RequestMethod,
  RequestOptions,
  Organization,
  Estate,
  Unit,
  Invoice,
  Payment,
  RequestItem,
  Broadcast,
  Paginated,
  ListInvoicesQuery,
  ListPaymentsQuery,
  ListRequestsQuery,
  LoginInput,
  LoginResponse,
} from './types';

export interface HoaClientOptions {
  /** Base URL including protocol and port. Defaults to https://api.hoa.africa . */
  baseUrl?: string;
  /** JWT access token. Mutually exclusive with apiKey. */
  accessToken?: string;
  /** Platform API key (`hoa_live_...`). Mutually exclusive with accessToken. */
  apiKey?: string;
  /** Default timeout in ms (per request). 30s default. */
  timeoutMs?: number;
  /** How many times to retry transient (5xx + 429) failures. Default 2. */
  maxRetries?: number;
  /**
   * Override the fetch implementation. Defaults to global fetch (Node 18+,
   * modern browsers, edge runtimes). Tests inject a stub here.
   */
  fetch?: typeof fetch;
  /** Default `User-Agent` for outbound requests. */
  userAgent?: string;
}

const DEFAULT_BASE_URL = 'https://api.hoa.africa';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

interface SdkConfig extends Required<Pick<HoaClientOptions, 'baseUrl' | 'timeoutMs' | 'maxRetries'>> {
  accessToken: string | null;
  apiKey: string | null;
  fetch: typeof fetch;
  userAgent: string;
}

/**
 * Thin, enterprise-grade client for HOA.africa.
 *
 * Auth: pass either `accessToken` (JWT) OR `apiKey` (X-API-Key). For end-user
 * apps, use the JWT returned from `auth.login()`. For server-to-server
 * integrations, use a platform API key minted from /api/platform/api-keys.
 *
 * Retries: 429 + 5xx are retried up to `maxRetries` times with exponential
 * backoff. 429 specifically honours `X-RateLimit-Reset` when present.
 *
 * Errors: every non-2xx response throws either `HoaAuthError` (401/403),
 * `HoaRateLimitError` (429 after retries exhausted), or `HoaAPIError`.
 */
export class HoaClient {
  private cfg: SdkConfig;
  readonly auth: AuthResource;
  readonly organizations: OrganizationsResource;
  readonly estates: EstatesResource;
  readonly units: UnitsResource;
  readonly invoices: InvoicesResource;
  readonly payments: PaymentsResource;
  readonly requests: RequestsResource;
  readonly broadcasts: BroadcastsResource;
  readonly graphql: GraphqlResource;

  constructor(opts: HoaClientOptions = {}) {
    if (opts.accessToken && opts.apiKey) {
      throw new Error('HoaClient: provide accessToken OR apiKey, not both');
    }
    this.cfg = {
      baseUrl: stripTrailingSlash(opts.baseUrl || process.env.HOA_API_BASE_URL || DEFAULT_BASE_URL),
      accessToken: opts.accessToken ?? process.env.HOA_API_TOKEN ?? null,
      apiKey: opts.apiKey ?? process.env.HOA_API_KEY ?? null,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
      fetch: opts.fetch ?? globalThis.fetch,
      userAgent: opts.userAgent ?? '@hoa-africa/sdk-js/0.1.0',
    };
    if (typeof this.cfg.fetch !== 'function') {
      throw new Error(
        'HoaClient: global fetch is not available. Pass options.fetch or upgrade to Node 18+.',
      );
    }
    this.auth = new AuthResource(this);
    this.organizations = new OrganizationsResource(this);
    this.estates = new EstatesResource(this);
    this.units = new UnitsResource(this);
    this.invoices = new InvoicesResource(this);
    this.payments = new PaymentsResource(this);
    this.requests = new RequestsResource(this);
    this.broadcasts = new BroadcastsResource(this);
    this.graphql = new GraphqlResource(this);
  }

  /** Update the bearer token. Useful after a refresh or login. */
  setAccessToken(token: string | null) {
    this.cfg.accessToken = token;
  }
  /** Update the API key. */
  setApiKey(key: string | null) {
    this.cfg.apiKey = key;
  }
  /** Currently configured base URL. */
  get baseUrl(): string {
    return this.cfg.baseUrl;
  }

  /**
   * Issue a raw request. Use when the resource helpers don't cover a path.
   * Path must start with `/` (e.g. `/api/platform/api-keys`). Returns the
   * parsed JSON body (or `undefined` for 204 / empty responses).
   */
  async request<T = unknown>(
    method: RequestMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const headers = this.buildHeaders(options);
    let body: BodyInit | undefined;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    } else if (options.body !== undefined) {
      body = options.body as BodyInit;
    }

    const timeoutMs = options.timeoutMs ?? this.cfg.timeoutMs;
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= this.cfg.maxRetries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await this.cfg.fetch(url, { method, headers, body, signal: controller.signal });
        clearTimeout(timer);
        if (res.status === 204 || res.headers.get('content-length') === '0') {
          if (res.ok) return undefined as T;
          throw await buildError(res);
        }
        const ct = res.headers.get('content-type') || '';
        const parsed: unknown = ct.includes('application/json') ? await res.json() : await res.text();
        if (res.ok) {
          // Most endpoints return { success, data } or { success, data, meta }.
          // Unwrap to `data` when no `meta` is present; when `meta` is there
          // (paginated lists), return `{ data, meta }` so callers can read both.
          // Tolerate legacy + GraphQL responses that don't envelope at all.
          if (
            parsed &&
            typeof parsed === 'object' &&
            'success' in (parsed as Record<string, unknown>) &&
            'data' in (parsed as Record<string, unknown>)
          ) {
            const env = parsed as { data: unknown; meta?: unknown };
            if (env.meta !== undefined) {
              return { data: env.data, meta: env.meta } as T;
            }
            return env.data as T;
          }
          return parsed as T;
        }
        // Retry on 429 / 5xx
        if ((res.status === 429 || res.status >= 500) && attempt < this.cfg.maxRetries) {
          await sleep(backoffMs(attempt, res));
          attempt += 1;
          continue;
        }
        throw await buildError(res, parsed);
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof HoaAPIError) throw err;
        // Network / abort — retry if attempts remain.
        if (attempt < this.cfg.maxRetries) {
          await sleep(backoffMs(attempt));
          attempt += 1;
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new Error('HoaClient: retry budget exhausted');
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const base = this.cfg.baseUrl;
    const url = new URL(path.startsWith('http') ? path : base + (path.startsWith('/') ? path : `/${path}`));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === null || v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private buildHeaders(options: RequestOptions): Record<string, string> {
    const out: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': this.cfg.userAgent,
    };
    if (this.cfg.accessToken) out['Authorization'] = `Bearer ${this.cfg.accessToken}`;
    if (this.cfg.apiKey) out['X-API-Key'] = this.cfg.apiKey;
    if (options.idempotencyKey) out['Idempotency-Key'] = options.idempotencyKey;
    if (options.headers) Object.assign(out, options.headers);
    return out;
  }
}

// ---------- helpers ----------

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number, res?: Response): number {
  // Honour X-RateLimit-Reset when the server gives us one.
  if (res) {
    const retryAfter = res.headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30_000);
    }
    const reset = res.headers.get('x-ratelimit-reset');
    if (reset) {
      const target = Number(reset) * 1000;
      const delta = target - Date.now();
      if (Number.isFinite(delta) && delta > 0) return Math.min(delta, 30_000);
    }
  }
  // Exponential backoff with jitter — 200ms, 400ms, 800ms, ...
  const base = 200 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 100);
  return Math.min(base + jitter, 10_000);
}

async function buildError(res: Response, parsed?: unknown): Promise<HoaAPIError> {
  let body: unknown = parsed;
  if (body === undefined) {
    const ct = res.headers.get('content-type') || '';
    body = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => null);
  }
  const requestId = res.headers.get('x-request-id') ?? res.headers.get('x-correlation-id') ?? null;
  let message = `HTTP ${res.status} ${res.statusText}`;
  let code: string | null = null;
  if (body && typeof body === 'object') {
    const m = (body as { message?: string | string[]; error?: string }).message;
    if (Array.isArray(m)) message = m.join('; ');
    else if (typeof m === 'string') message = m;
    if (typeof (body as { error?: string }).error === 'string') code = (body as { error: string }).error;
  }
  if (res.status === 401 || res.status === 403) {
    return new HoaAuthError({ message, status: res.status, code, body, requestId });
  }
  if (res.status === 429) {
    const retryAfterSeconds = Number(res.headers.get('retry-after')) || 60;
    return new HoaRateLimitError({ message, status: res.status, code, body, requestId, retryAfterSeconds });
  }
  return new HoaAPIError({ message, status: res.status, code, body, requestId });
}

// ---------- resources ----------

class Resource {
  constructor(protected readonly client: HoaClient) {}
}

export class AuthResource extends Resource {
  /** POST /api/auth/login. On success, sets the client's access token. */
  async login(input: LoginInput): Promise<LoginResponse> {
    const out = await this.client.request<LoginResponse>('POST', '/api/auth/login', { json: input });
    if (out?.accessToken) this.client.setAccessToken(out.accessToken);
    return out;
  }
  /** GET /api/auth/profile. */
  async profile(): Promise<LoginResponse['user']> {
    return this.client.request('GET', '/api/auth/profile');
  }
}

export class OrganizationsResource extends Resource {
  /** GET /api/organizations/current. */
  current(): Promise<Organization> {
    return this.client.request('GET', '/api/organizations/current');
  }
}

export class EstatesResource extends Resource {
  list(query: { page?: number; limit?: number } = {}): Promise<Paginated<Estate>> {
    return this.client.request('GET', '/api/estates', { query });
  }
  get(id: string): Promise<Estate> {
    return this.client.request('GET', `/api/estates/${encodeURIComponent(id)}`);
  }
}

export class UnitsResource extends Resource {
  /** Units are scoped to an estate — `estateId` is required. */
  list(query: { estateId: string }): Promise<Unit[]> {
    return this.client.request('GET', `/api/estates/${encodeURIComponent(query.estateId)}/units`);
  }
  get(id: string): Promise<Unit> {
    return this.client.request('GET', `/api/units/${encodeURIComponent(id)}`);
  }
}

export class InvoicesResource extends Resource {
  list(query: ListInvoicesQuery = {}): Promise<Paginated<Invoice>> {
    return this.client.request('GET', '/api/invoices', { query });
  }
  get(id: string): Promise<Invoice> {
    return this.client.request('GET', `/api/invoices/${encodeURIComponent(id)}`);
  }
  /** POST /api/invoices. Use Idempotency-Key to safely retry. */
  create(input: Record<string, unknown>, opts: { idempotencyKey?: string } = {}): Promise<Invoice> {
    return this.client.request('POST', '/api/invoices', { json: input, idempotencyKey: opts.idempotencyKey });
  }
}

export class PaymentsResource extends Resource {
  list(query: ListPaymentsQuery = {}): Promise<Paginated<Payment>> {
    return this.client.request('GET', '/api/payments', { query });
  }
  get(id: string): Promise<Payment> {
    return this.client.request('GET', `/api/payments/${encodeURIComponent(id)}`);
  }
  /** POST /api/payments. Idempotency-Key strongly recommended. */
  create(input: Record<string, unknown>, opts: { idempotencyKey?: string } = {}): Promise<Payment> {
    return this.client.request('POST', '/api/payments', { json: input, idempotencyKey: opts.idempotencyKey });
  }
}

export class RequestsResource extends Resource {
  list(query: ListRequestsQuery = {}): Promise<Paginated<RequestItem>> {
    return this.client.request('GET', '/api/requests', { query });
  }
  get(id: string): Promise<RequestItem> {
    return this.client.request('GET', `/api/requests/${encodeURIComponent(id)}`);
  }
  create(input: Record<string, unknown>, opts: { idempotencyKey?: string } = {}): Promise<RequestItem> {
    return this.client.request('POST', '/api/requests', { json: input, idempotencyKey: opts.idempotencyKey });
  }
}

export class BroadcastsResource extends Resource {
  list(query: { status?: string } = {}): Promise<Broadcast[]> {
    return this.client.request('GET', '/api/communications/broadcasts/v2', { query });
  }
  get(id: string): Promise<Broadcast> {
    return this.client.request('GET', `/api/communications/broadcasts/v2/${encodeURIComponent(id)}`);
  }
}

/**
 * GraphQL convenience — same auth, same retry policy. Throws on transport
 * failure. Per GraphQL convention, partial-data responses include an `errors`
 * array; this helper surfaces it as a `HoaAPIError` when no `data` is present.
 */
export class GraphqlResource extends Resource {
  async query<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const out = await this.client.request<{ data?: T; errors?: Array<{ message: string }> }>(
      'POST',
      '/graphql',
      { json: { query, variables } },
    );
    if (out && 'errors' in out && Array.isArray(out.errors) && out.errors.length > 0 && !out.data) {
      throw new HoaAPIError({
        message: out.errors.map((e) => e.message).join('; '),
        status: 400,
        body: out.errors,
      });
    }
    return (out?.data ?? (out as unknown)) as T;
  }
}
