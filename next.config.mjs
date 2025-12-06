/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  experimental: {
    // force webpack instead of turbopack
    webpackBuild: true,
    turbo: false,
  },

  productionBrowserSourceMaps: true,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  webpack: (config) => {
    config.devtool = 'source-map'
    return config
  },
}

export default nextConfig
