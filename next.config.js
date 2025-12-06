/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable React Strict Mode to prevent double rendering
  reactStrictMode: false,

  // Force Webpack (disable Turbopack)
  experimental: {
    // Explicitly disable Turbopack
    turbo: undefined,
  },

  // Use Webpack for bundling
  webpack: (config, { isServer }) => {
    // Enable source maps for better debugging
    config.devtool = 'source-map'
    return config
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  // Ensure all API calls work correctly
  async rewrites() {
    return []
  },
}

module.exports = nextConfig
