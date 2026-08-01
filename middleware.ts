import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/proxy/')) {
    const token = request.cookies.get('token')?.value;
    const requestHeaders = new Headers(request.headers);
    if (token) {
      requestHeaders.set('Authorization', `Bearer ${token}`);
    }

    const path = request.nextUrl.pathname.replace('/api/proxy/', '');
    const url = `https://gps-backend-jzd7.onrender.com/api/${path}${request.nextUrl.search}`;

    return NextResponse.rewrite(new URL(url), {
      request: {
        headers: requestHeaders,
      },
    });
  }
}
