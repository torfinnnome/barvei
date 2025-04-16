// middleware.ts
import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server'; // Import NextResponse
import { locales, localePrefix, pathnames } from './navigation';

export default function middleware(request: NextRequest) {
  console.log(`-- Middleware executing for path: ${request.nextUrl.pathname} --`);

  // Determine the locale BEFORE calling createMiddleware to see if it's extracted
  let detectedLocale = 'unknown'; // Default to unknown
  const pathname = request.nextUrl.pathname;
  const pathLocale = locales.find(
      (cur) => pathname.startsWith(`/${cur}/`) || pathname === `/${cur}`
  );

  if (pathLocale) {
      detectedLocale = pathLocale;
  } else if (pathname === '/') {
      // If root path, the default locale should apply
      detectedLocale = 'en'; // Set explicitly based on default for logging
  }
  console.log(`-- Middleware detected path locale (or default for root): ${detectedLocale} --`);


  const handleI18nRouting = createMiddleware({
    locales: locales,
    defaultLocale: 'en',
    localePrefix: localePrefix,
    pathnames: pathnames
  });

  console.log(`-- Middleware calling handleI18nRouting --`);
  const response = handleI18nRouting(request);
  console.log(`-- Middleware handleI18nRouting finished --`);

  // It's unusual, but let's log the response headers to see if next-intl adds anything
  // response.headers.forEach((value, key) => {
  //   console.log(`   Response Header: ${key}: ${value}`);
  // });

  return response;
}

export const config = {
  matcher: ['/', '/((?!api|_next/static|_next/image|favicon.ico|images).*)']
};
