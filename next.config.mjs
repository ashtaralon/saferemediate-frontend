/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Fix Geist font CORS issue
  transpilePackages: ['geist'],
}

export default nextConfig
