// next.config.js

// Use require for CommonJS compatibility in .js config files
const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin(
  // Provide the path to your i18n configuration file
  './i18n.ts' // Make sure this file exists in the root
);

/** @type {import('next').NextConfig} */ // JSDoc type hint is okay
const nextConfig = {
  // Your other Next.js config options go here
  reactStrictMode: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.met.no',
        port: '',
        pathname: '/images/weathericons/**', // Keep for any other images
      },
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        port: '',
        pathname: '/metno/weathericons/main/weather/png/**',
      },
    ],
  },
};

// Use module.exports for CommonJS
module.exports = withNextIntl(nextConfig);

