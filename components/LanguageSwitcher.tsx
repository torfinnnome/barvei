// components/LanguageSwitcher.tsx
'use client'; // This component needs client-side interactivity

import { usePathname, useRouter } from '@/navigation'; // Import from your local navigation file
import { locales } from '@/navigation'; // Import your locales array
import { useLocale } from 'next-intl';
import React from 'react'; // Import React if using TSX specific features like type annotations

export default function LanguageSwitcher() {
    const currentLocale = useLocale(); // Hook to get the currently active locale
    const router = useRouter(); // Locale-aware router hook
    const pathname = usePathname(); // Locale-aware pathname hook (gives path without locale prefix)

    const handleLocaleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const nextLocale = event.target.value;
        // Replace the current route with the same pathname but the new locale
        router.replace(pathname, { locale: nextLocale });
    };

    return (
        // Simple styling, adjust as needed
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000 }}>
            <select
                onChange={handleLocaleChange}
                value={currentLocale}
                style={{ padding: '0.3rem', fontSize: '0.9rem' }}
            >
                {locales.map((loc) => (
                    <option key={loc} value={loc}>
                        {/* Display locale code, you could map this to full names */}
                        {loc.toUpperCase()}
                    </option>
                ))}
            </select>
        </div>
    );
}
