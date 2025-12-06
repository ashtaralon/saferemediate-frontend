/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  // ⛔ מכבה Turbopack + ⛔ מכריח Webpack
  experimental: {
    turbo: false,
    webpackBuild: true,
  },

  // מאפשר source maps בפרודקשן
  productionBrowserSourceMaps: true,

  webpack: (config) => {
    config.devtool = "source-map";
    return config;
  },
};

module.exports = nextConfig;

