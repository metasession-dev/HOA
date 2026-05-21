// Phase 9.3: lightweight types covering the high-value resources exposed via
// the resource-helper surface. The full API surface (227+ paths) is reachable
// via `client.request(...)` for callers that need unrestricted access — this
// keeps the SDK small and forgiving while still typing the common workflows.
//
// To regenerate fully-typed schemas, run `openapi-typescript ../HOA-API/openapi.json`
// and import the `components['schemas']` map.

export interface Organization {
  id: string;
  name: string;
  slug: string;
  currency: string;
  country: string;
  timezone: string;
  language: string;
  createdAt: string;
}

export interface Estate {
  id: string;
  name: string;
  address: string | null;
  totalUnits: number;
  organizationId?: string;
  createdAt?: string;
}

export interface Unit {
  id: string;
  unitNumber: string;
  block: string | null;
  floor: number | null;
  type: string;
  tags: string[];
  estateId: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: string;
  amount: string;
  currency: string;
  status: string;
  dueDate: string;
  paidAt: string | null;
  sentAt: string | null;
  unitId: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  processedAt: string | null;
  processorReference: string | null;
  invoiceId: string;
}

export interface RequestItem {
  id: string;
  subject: string;
  body: string;
  status: string;
  priority: string;
  unitId: string | null;
  categoryId: string;
  dueAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface Broadcast {
  id: string;
  subject: string;
  status: string;
  channels: string[];
  scheduledAt: string | null;
  sentAt: string | null;
  resolvedRecipients: number;
  successCount: number;
  failureCount: number;
  optOutCount: number;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export type ListInvoicesQuery = {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  unitId?: string;
  from?: string;
  to?: string;
} & Record<string, string | number | boolean | null | undefined>;

export type ListPaymentsQuery = {
  page?: number;
  limit?: number;
  status?: string;
} & Record<string, string | number | boolean | null | undefined>;

export type ListRequestsQuery = {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  unitId?: string;
} & Record<string, string | number | boolean | null | undefined>;

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    organizationId: string;
    role: string;
  };
}

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /** Query string parameters. Falsy values are dropped. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** JSON body. Stringified automatically; sets Content-Type. */
  json?: unknown;
  /** Raw body. Use for non-JSON payloads. Caller sets Content-Type via headers. */
  body?: BodyInit;
  /** Extra request headers (override SDK defaults except Authorization). */
  headers?: Record<string, string>;
  /** Per-call timeout override (ms). */
  timeoutMs?: number;
  /** Idempotency-Key header. */
  idempotencyKey?: string;
}
