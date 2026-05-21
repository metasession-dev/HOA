import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side route gate. Without this, an unauthenticated user could hit
 * `/admin` and see a brief flash of the page chrome before the client-side
 * `useEffect` redirect kicked in. Middleware runs in the Edge runtime
 * before any page renders, so the redirect happens server-side — no flash.
 *
 * The middleware checks COOKIE presence only. The actual JWT is validated
 * by the API on every request; this is a coarse "is there a session" gate.
 * The cookie is written by `api.setToken()` alongside the localStorage entry
 * the api-client uses for the Authorization header.
 *
 * Protected paths: everything under (dashboard) — `/admin/*`, `/finance/*`,
 * `/communications/*`, `/payables/*`, `/estates/*` (if present), `/violations/*`,
 * `/votes/*`, `/surveys/*`, `/gate/*`, `/board`, `/resale/*`, `/documents/*`,
 * `/passes/*`, `/settings/*`. Catching them via "everything that isn't
 * explicitly public" is more robust than maintaining a per-route list.
 */
const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

// Paths that should never be touched by auth gating (next.js plumbing,
// static assets, API proxies). The matcher below excludes most of these
// at the routing layer; this set is a defence-in-depth check.
function isAlwaysAllowed(pathname: string) {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/splash/') ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.png' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isAlwaysAllowed(pathname)) return NextResponse.next();
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (pathname.startsWith('/invites/')) return NextResponse.next(); // invite redeem flow
  if (pathname.startsWith('/r/')) return NextResponse.next();        // public resale links
  if (pathname.startsWith('/v/')) return NextResponse.next();        // visitor verify

  const token = req.cookies.get('hoa_token')?.value;
  if (token && token.length > 0) {
    return NextResponse.next();
  }

  // Unauthenticated — bounce to /login and preserve the original target as
  // `?next=…` so we can deep-link them back after sign-in.
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

// Run the middleware on everything EXCEPT next internals + static assets
// (faster than re-checking in the handler).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.png).*)'],
};
