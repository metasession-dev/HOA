const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (typeof window === 'undefined') return;
    if (token) {
      localStorage.setItem('hoa_token', token);
      // Mirror to a cookie so Next.js middleware can gate routes
      // server-side. See ENTERPRISE for full rationale — same pattern.
      const maxAge = 60 * 60 * 24;
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `hoa_token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
    } else {
      localStorage.removeItem('hoa_token');
      document.cookie = 'hoa_token=; path=/; max-age=0; SameSite=Lax';
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('hoa_token');
    }
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}/api${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      this.setToken(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Unauthorized');
    }

    // 204 No Content / empty bodies (e.g. DELETE) — return undefined.
    if (res.status === 204 || res.headers.get('content-length') === '0') {
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return undefined as unknown as T;
    }

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || json.error || 'Request failed');
    }
    return json;
  }

  get<T>(path: string, headers?: Record<string, string>) {
    return this.request<T>(path, { headers });
  }

  /**
   * Auto-generate an Idempotency-Key when none is supplied. The API's
   * `@Idempotent()` guard requires the header on state-changing endpoints
   * (revoke, batch-pay, cast vote, etc.) — defaulting to "always send one"
   * means a new caller never has to remember it. Callers that want
   * deterministic coalescing (collapse double-clicks) override with a
   * stable key.
   */
  private newIdempotencyKey(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `auto-${crypto.randomUUID()}`;
    }
    return `auto-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }

  post<T>(path: string, data?: any, idempotencyKey?: string) {
    const headers: Record<string, string> = {
      'Idempotency-Key': idempotencyKey ?? this.newIdempotencyKey(),
    };
    return this.request<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      headers,
    });
  }

  put<T>(path: string, data?: any, idempotencyKey?: string) {
    const headers: Record<string, string> = {
      'Idempotency-Key': idempotencyKey ?? this.newIdempotencyKey(),
    };
    return this.request<T>(path, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      headers,
    });
  }

  delete<T>(path: string, idempotencyKey?: string) {
    const headers: Record<string, string> = {
      'Idempotency-Key': idempotencyKey ?? this.newIdempotencyKey(),
    };
    return this.request<T>(path, { method: 'DELETE', headers });
  }
}

export const api = new ApiClient();
