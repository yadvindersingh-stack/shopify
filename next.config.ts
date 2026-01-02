import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@shopify/polaris", "@shopify/app-bridge"],
};

export default nextConfig;
