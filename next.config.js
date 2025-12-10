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
    serverActions: {
      allowedOrigins: ['*'],
    },
  },

  // מאפשר source maps בפרודקשן
  productionBrowserSourceMaps: true,

  swcMinify: true,
  generateEtags: false,
  poweredByHeader: false,
  compress: false,

  webpack: (config) => {
    config.devtool = "source-map";
    return config;
  },

  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
      ],
    },
  ],
};

module.exports = nextConfig;

