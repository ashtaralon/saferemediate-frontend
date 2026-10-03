import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export default {
  devIndicators: false,
  webpack(config) { config.resolve.alias["@"] = root; return config; },
  async headers() { return [{ source: "/:path*", headers: [
    { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:3210; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'self'" },
    { key: "Cache-Control", value: "no-store" },
    { key: "X-Cyntro-Preview", value: "recorded-responses-no-live-backend" },
  ]}]; },
};
