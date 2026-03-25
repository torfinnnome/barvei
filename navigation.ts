import { createNavigation } from 'next-intl/navigation';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
    locales: ['en', 'no', 'es'],
    defaultLocale: 'en',
    localePrefix: 'always',
    pathnames: {
        '/': '/'
    }
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
    createNavigation(routing);

export const locales = routing.locales;
export type Locale = (typeof locales)[number];

