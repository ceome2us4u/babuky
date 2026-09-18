/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output runs unchanged on ECS/Fargate, App Runner, or EC2 —
  // no Vercel-specific build target.
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
