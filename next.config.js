/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  // Experimental features for Next.js 16
  experimental: {
    serverActions: {
      allowedOrigins: ['*'],
    },
  },

  // מאפשר source maps בפרודקשן
  productionBrowserSourceMaps: true,
  generateEtags: false,
  poweredByHeader: false,
  compress: false,

  // Turbopack config (Next.js 16 uses Turbopack by default)
  turbopack: {},

  webpack: (config) => {
    config.devtool = "source-map";
    return config;
  },

  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
      ],
    },
  ],

  // 2026-06-02: Consolidate to /shared-resources per operator direction.
  // Three legacy URLs redirect to the new unified merged-list page:
  //
  //   1. /?section=per-resource — the legacy "Shared Resource Analysis"
  //      page that calls /api/scan. Empirically broken: /api/scan returns
  //      4 SGs and zero IAM roles on alon-prod, so SafeRemediate-Lambda-
  //      Remediation-Role and other real shared IAM roles are invisible
  //      there. Phantom-incapability per pattern_no_phantom_capabilities_in_ui
  //      (inversion direction).
  //   2. /iam/shared-roles — legacy IAM-only list. Subsumed by
  //      /shared-resources merged list using /api/iam/shared-roles.
  //   3. /sg/shared-sgs — legacy SG-only list. Subsumed by
  //      /shared-resources merged list using /api/sg/shared-sgs.
  //
  // Detail routes /iam/shared-roles/by-plan/[plan_id] and
  // /sg/shared-sgs/by-plan/[plan_id] are NOT redirected — they're
  // useful deep-links to plan-specific narrowing proposals.
  //
  // permanent: false (307) so browsers don't cache aggressively — keeps
  // the rollback path open if we ever need to bring legacy back.
  // The /api/proxy/iam/shared-roles/* and /api/proxy/sg/shared-sgs/*
  // routes are unaffected — those are API endpoints, not page routes.
  // 2026-06-02 (revised again): all three legacy redirects removed.
  // The dark V2 list (shared-resources-list-view.tsx) has an "Open full
  // {role,SG} detail" button on each expanded row that navigates to
  // /iam/shared-roles?focus=X or /sg/shared-sgs?focus=X. With those
  // redirects in place, the button bounced users back to the V2 page
  // they were already on. Per operator direction: keep both surfaces
  // independently reachable.
  redirects: async () => [],
};

module.exports = nextConfig;

