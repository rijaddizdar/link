import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { GATE_COOKIE, isUnlocked, sitePassword } from '@/lib/gate';

/**
 * Two locks, in order:
 *
 *   1. The site gate. Without the shared password nothing past /unlock is
 *      reachable — not the sign-in page, not anything.
 *   2. The Supabase session, which keeps signed-out visitors on /login.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname !== '/unlock') {
    const unlocked = await isUnlocked(request.cookies.get(GATE_COOKIE)?.value, sitePassword());
    if (!unlocked) {
      const target = request.nextUrl.clone();
      target.pathname = '/unlock';
      target.search = '';
      if (pathname !== '/') target.searchParams.set('next', `${pathname}${search}`);
      return NextResponse.redirect(target);
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
