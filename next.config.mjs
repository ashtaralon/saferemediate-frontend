/** @type {import('next').NextConfig} */
const nextConfig = {
  // Parallel dev instances (e.g. two agent sessions previewing the same
  // checkout) collide on .next/dev/lock — give each its own dist dir.
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
