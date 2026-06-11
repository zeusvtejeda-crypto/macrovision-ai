import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Block non-admin users from all dashboard routes
    if (path.startsWith('/dashboard') || path.startsWith('/users') ||
        path.startsWith('/analyses') || path.startsWith('/subscriptions') ||
        path.startsWith('/health') || path.startsWith('/settings')) {
      if (!token || !['ADMIN', 'SUPER_ADMIN'].includes(token.role as string)) {
        return NextResponse.redirect(new URL('/login', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        if (path === '/login') return true;
        return !!token;
      },
    },
  },
);

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
