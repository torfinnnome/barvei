// i18n.ts (Reverting to use the {locale} parameter)
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from './navigation';
// No need to import getLocale anymore

const loadMessages = async (locale: string) => {
    // Basic validation: If locale is invalid/missing (shouldn't happen now), trigger 404
    if (!locale || !locales.includes(locale as any)) {
        console.error(`[i18n Load v3 Param] Invalid or undefined locale "${locale}" received. Middleware issue?`);
        notFound(); // Trigger 404 if locale is truly invalid/missing
    }

    try {
        console.log(`[i18n Load v3 Param] Attempting to load messages for: ${locale}`);
        return (await import(`./messages/${locale}.json`)).default;
    } catch (error) {
        console.error(`[i18n Load v3 Param] ERROR loading messages for ${locale}:`, error);
        // Trigger 404 if messages for a supposedly valid locale can't be loaded
        notFound();
    }
};

// Use the {locale} parameter again
export default getRequestConfig(async ({ locale }) => {
    console.log(`[i18n Config v3 Param] getRequestConfig received locale: >>>${locale}<<<`);

    // Load messages for the received locale
    const messages = await loadMessages(locale);

    // Return both locale and messages (as required by the other warning)
    console.log(`[i18n Config v3 Param] Returning locale and messages object for locale: ${locale}`);
    return {
        locale, // Still return the locale received as a parameter
        messages: messages
    };
});
