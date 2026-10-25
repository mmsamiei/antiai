/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  basePath,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/animals/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
  experimental: { serverComponentsExternalPackages: ["@prisma/client"] }
};

export default nextConfig;
