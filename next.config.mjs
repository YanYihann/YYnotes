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
};

export default nextConfig;
