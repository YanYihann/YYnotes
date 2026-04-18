/** @type {import('next').NextConfig} */
const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const repoName = "YYnotes";

const nextConfig = {
  reactStrictMode: true,
  output: isGithubActions ? "export" : undefined,
  trailingSlash: isGithubActions,
  images: {
    unoptimized: true,
  },
  basePath: isGithubActions ? `/${repoName}` : "",
  assetPrefix: isGithubActions ? `/${repoName}/` : "",
};

export default nextConfig;
