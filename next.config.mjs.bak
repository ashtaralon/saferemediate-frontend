/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  images: {
    unoptimized: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  experimental: {
    turbo: false,        // ⛔ כבה Turbopack
    webpackBuild: true,  // ✅ הפעל Webpack
  },

  webpack: (config) => {
    config.devtool = "source-map"; // אפשר דיבאג אמיתי
    return config;
  },

  productionBrowserSourceMaps: true, // Source maps ב-production
};

export default nextConfig;
