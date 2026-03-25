import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import '../globals.css';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Route Weather App',
  description: 'Plan your route and see the weather along the way',
};

interface RootLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function RootLayout({
  children,
  params
}: Readonly<RootLayoutProps>) {
  const { locale } = await params;
  // `getMessages` fetches messages on the server
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <LanguageSwitcher />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
