/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  // Experimental features for Next.js 16
  experimental: {
    serverActions: {
      allowedOrigins: ['*'],
    },
  },

  // מאפשר source maps בפרודקשן
  productionBrowserSourceMaps: true,
  generateEtags: false,
  poweredByHeader: false,
  compress: false,

  // Turbopack config (Next.js 16 uses Turbopack by default)
  turbopack: {},

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

