import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './navigation';

export default function middleware(request: NextRequest) {
    console.log(`-- Middleware executing for path: ${request.nextUrl.pathname} --`);

    const handleI18nRouting = createMiddleware(routing);

    console.log(`-- Middleware calling handleI18nRouting --`);
    const response = handleI18nRouting(request);
    console.log(`-- Middleware handleI18nRouting finished --`);

    return response;
}

export const config = {
  matcher: ['/', '/((?!api|_next/static|_next/image|favicon.ico|images).*)']
};
