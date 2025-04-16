// navigation.ts (Temporary Simplification)
// import { Pathnames } from 'next-intl/navigation'; // Import only the type if needed
import { createLocalizedPathnamesNavigation, Pathnames } from 'next-intl/navigation';

export const locales = ['en', 'no', 'es'] as const;
export type Locale = typeof locales[number]; // Optional: define a type for locales

export const localePrefix = 'always'; // Or 'as-needed', 'never'

// Define pathnames using 'satisfies' for better type checking
export const pathnames = {
    '/': '/'
    // Example for localized paths if you add more pages:
    // '/about': {
    //   en: '/about',
    //   no: '/om',
    //   es: '/acerca-de'
    // }
} satisfies Pathnames<typeof locales>;

export const { Link, redirect, usePathname, useRouter } =
    createLocalizedPathnamesNavigation({ locales, localePrefix, pathnames });

