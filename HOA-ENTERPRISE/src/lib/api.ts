const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (typeof window === 'undefined') return;
    if (token) {
      localStorage.setItem('hoa_token', token);
      // Mirror to a cookie so Next.js middleware can see it. NOT HttpOnly —
      // the client still needs to read it from localStorage for the
      // Authorization header. SameSite=Lax + Secure-when-https gives us
      // CSRF protection at the cookie level; the middleware uses cookie
      // *presence* only as a coarse "is there a session" gate, the API
      // still validates the JWT on every request.
      const maxAge = 60 * 60 * 24; // 24h; matches default JWT TTL
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
    // Phase 8.1: include the active UI locale so server-side rendering
    // (emails, broadcasts, error messages) can localize. Review #19: validate
    // against the supported list so an XSS-poisoned localStorage can't smuggle
    // a giant or malformed header.
    if (typeof window !== 'undefined') {
      try {
        const locale = localStorage.getItem('hoa.locale');
        const SUPPORTED = ['en', 'fr', 'pt', 'sw'];
        if (locale && SUPPORTED.includes(locale)) headers['Accept-Language'] = locale;
      } catch { /* no-op */ }
    }

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
   * Generate a random Idempotency-Key. Used as a fallback when the caller
   * doesn't pass one — the API's `@Idempotent()` guard requires the header
   * on a growing list of state-changing endpoints (revoke invite, resend
   * invite, batch-pay, cast vote, etc.). The safe default is "always send
   * one"; callers who want double-click-coalescing semantics (e.g. the
   * resend button) override with a deterministic key.
   *
   * crypto.randomUUID is available everywhere we run; we still feature-test
   * for SSR builds where it might be polyfilled later.
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
