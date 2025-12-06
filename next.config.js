/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  // CORS SOLUTION: Rewrite /backend/* to the actual backend
  // Browser sees same-origin, Vercel proxies server-to-server
  async rewrites() {
    return [
      {
        source: '/backend/:path*',
        destination: 'https://saferemediate-backend.onrender.com/:path*',
      },
    ]
  },
}

module.exports = nextConfig
