/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  // SOLUTION: Use rewrites to proxy API calls - NO CORS issues!
  // The browser calls /api/proxy/* on Vercel (same origin)
  // Vercel proxies it to the backend (server-to-server, no CORS)
  async rewrites() {
    const BACKEND = 'https://saferemediate-backend.onrender.com'

    return {
      // These rewrites run BEFORE the filesystem (pages/api routes)
      beforeFiles: [],

      // These run AFTER filesystem but before dynamic routes
      afterFiles: [
        // Direct backend proxy - catches everything not handled by API routes
        {
          source: '/backend/api/:path*',
          destination: `${BACKEND}/api/:path*`,
        },
      ],

      // Fallback rewrites - run if no page/api route matches
      fallback: [
        // If /api/proxy/* doesn't have a matching route file, proxy directly
        {
          source: '/api/proxy/:path*',
          destination: `${BACKEND}/api/:path*`,
        },
      ],
    }
  },
}

module.exports = nextConfig
