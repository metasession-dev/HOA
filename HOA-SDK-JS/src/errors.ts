// Phase 9.3: typed errors so SDK consumers can `catch (e) { if (e instanceof
// HoaAPIError) ... }` and discriminate on status + the API's structured code.

export class HoaAPIError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly body: unknown;
  readonly requestId: string | null;

  constructor(opts: {
    message: string;
    status: number;
    code?: string | null;
    body?: unknown;
    requestId?: string | null;
  }) {
    super(opts.message);
    this.name = 'HoaAPIError';
    this.status = opts.status;
    this.code = opts.code ?? null;
    this.body = opts.body;
    this.requestId = opts.requestId ?? null;
  }

  /** Convenience predicate for catch-and-retry callers. */
  get isRateLimit(): boolean {
    return this.status === 429;
  }
  /** 4xx — caller-side problem; do not retry. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
  /** 5xx — server-side problem; safe to retry. */
  get isServerError(): boolean {
    return this.status >= 500;
  }
}

export class HoaAuthError extends HoaAPIError {
  constructor(opts: ConstructorParameters<typeof HoaAPIError>[0]) {
    super(opts);
    this.name = 'HoaAuthError';
  }
}

export class HoaRateLimitError extends HoaAPIError {
  readonly retryAfterSeconds: number;
  constructor(opts: ConstructorParameters<typeof HoaAPIError>[0] & { retryAfterSeconds: number }) {
    super(opts);
    this.name = 'HoaRateLimitError';
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}
