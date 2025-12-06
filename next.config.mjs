/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  // ✅ Force Webpack instead of Turbopack (critical for Next.js 16)
  experimental: {
    webpackBuild: true,
  },

  // Enable production source maps for debugging
  productionBrowserSourceMaps: true,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },
};

export default nextConfig;
