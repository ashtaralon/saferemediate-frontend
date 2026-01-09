/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Fix Geist font CORS issue and ensure X6 libraries are transpiled
  transpilePackages: ['geist', '@antv/x6', '@antv/x6-react-shape'],
}

export default nextConfig
