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
  webpack: (config) => {
    if (isDebug) {
      console.log("🔧 Debug Mode Enabled — Development Build on Vercel");
      config.mode = "development";
      config.devtool = "source-map";
    }
    return config;
  },
}

export default nextConfig
