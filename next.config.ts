import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Only lint pages and components directories during build, exclude tests
    dirs: ['src/app', 'src/components', 'src/lib'],
  },
  typescript: {
    // Type check only the necessary files during build
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
