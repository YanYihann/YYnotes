/** @type {import('next').NextConfig} */
const deployTarget = process.env.DEPLOY_TARGET?.trim().toLowerCase() ?? "";
const isStaticExport = deployTarget === "github-pages" || deployTarget === "cloudflare-pages";
const isGithubPages = deployTarget === "github-pages";
const repoName = "YYnotes";

const nextConfig = {
  reactStrictMode: true,
  output: isStaticExport ? "export" : undefined,
  trailingSlash: isStaticExport,
  images: {
    unoptimized: true,
  },
  basePath: isGithubPages ? `/${repoName}` : "",
  assetPrefix: isGithubPages ? `/${repoName}/` : "",
  // Vercel proxies the established Worker under this site's origin. This keeps
  // preview URLs and the custom domain functional without widening Worker CORS.
  ...(!isStaticExport && process.env.NOTES_UPSTREAM_URL ? {
    async rewrites() {
      return [{ source: "/api/cloud/:path*", destination: `${process.env.NOTES_UPSTREAM_URL.replace(/\/+$/, "")}/:path*` }];
    },
  } : {}),
};

export default nextConfig;
