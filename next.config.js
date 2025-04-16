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
};

// Use module.exports for CommonJS
module.exports = withNextIntl(nextConfig);




// next.config.ts
// import type { NextConfig } from 'next'; // Use 'import type'
// import createNextIntlPlugin from 'next-intl/plugin';
// 
// const withNextIntl = createNextIntlPlugin(
//   './i18n.ts'
// );
// 
// const nextConfig: NextConfig = {
//   // Your config here
//   reactStrictMode: true,
// };
// 
// export default withNextIntl(nextConfig);
