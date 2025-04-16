// app/[locale]/layout.tsx
//'use client'; // <--- Make layout a client component

import type { Metadata } from 'next'; // Optional: Keep if you define metadata
import { Inter } from 'next/font/google';
import { NextIntlClientProvider, useMessages } from 'next-intl'; // Core provider and message hook
import '../globals.css'; // Your global styles
import LanguageSwitcher from '@/components/LanguageSwitcher'; // Import the client component

const inter = Inter({ subsets: ['latin'] });

// export const metadata: Metadata = {
//   title: 'Route Weather App', // Default title, can be localized later
//   description: 'Plan your route and see the weather along the way',
// };


interface RootLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default function RootLayout({
  children,
  params: { locale } // Get locale directly from params provided by Next.js routing
}: Readonly<RootLayoutProps>) {
  // `useMessages` fetches messages prepared by `i18n.ts` on the server
  const messages = useMessages();

  // Basic checks (optional but good practice)
  if (!locale) {
      console.error("Layout Error: locale parameter is missing!");
      // Handle error appropriately, maybe render fallback content
  }
   if (!messages || typeof messages !== 'object') {
      console.error("Layout Error: Invalid messages object received!");
      // Handle error appropriately
  }

  return (
    // Pass the server-determined locale to the html tag
    <html lang={locale}>
      <body className={inter.className}>
        {/*
          Initialize the provider on the server with the fetched messages
          and the current locale. This makes the context available to all
          Client Components rendered within its children.
        */}
        <NextIntlClientProvider locale={locale} messages={messages}>
          {/* Render the LanguageSwitcher Client Component */}
          <LanguageSwitcher />
          {/* Render the rest of the page */}
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
