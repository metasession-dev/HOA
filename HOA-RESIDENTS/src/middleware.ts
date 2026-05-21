import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side route gate for the resident PWA. Same shape as the
 * ENTERPRISE middleware — see that file for full rationale.
 *
 * Protected: everything in (portal). Public: the auth pages, the invite
 * redeem at /invites/[token], the public resale page at /r/[token], and
 * the visitor verify page at /v/[code].
 */
const PUBLIC_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

function isAlwaysAllowed(pathname: string) {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/splash/') ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.png' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname === '/custom-sw.js' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isAlwaysAllowed(pathname)) return NextResponse.next();
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (pathname.startsWith('/invites/')) return NextResponse.next();
  if (pathname.startsWith('/r/')) return NextResponse.next();
  if (pathname.startsWith('/v/')) return NextResponse.next();
  if (pathname.startsWith('/mock-checkout')) return NextResponse.next();

  const token = req.cookies.get('hoa_token')?.value;
  if (token && token.length > 0) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.png|manifest.webmanifest|sw.js|custom-sw.js).*)'],
};
