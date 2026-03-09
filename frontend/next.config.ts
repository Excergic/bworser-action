import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone", // required for Docker / self-hosted deploy
};

export default nextConfig;
