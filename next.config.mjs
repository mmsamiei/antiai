/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  basePath,
  poweredByHeader: false,
  experimental: { serverComponentsExternalPackages: ["@prisma/client"] }
};

export default nextConfig;
