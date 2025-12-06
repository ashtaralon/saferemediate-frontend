/** @type {import('next').NextConfig} */
/** Enable React Dev Mode for debugging */
const isDebug = process.env.NEXT_PUBLIC_DEBUG === "true";

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Enable source maps in production for debugging
  productionBrowserSourceMaps: true,
  webpack: (config, { dev, isServer }) => {
    if (isDebug) {
      console.log("🔧 Debug Mode Enabled — Development Build on Vercel");
      config.mode = "development";
      config.devtool = "source-map";
    } else {
      // Enable source maps even in production for debugging
      if (!isServer) {
        config.devtool = "source-map";
      }
    }
    return config;
  },
}

export default nextConfig
