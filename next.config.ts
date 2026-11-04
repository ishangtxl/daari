import type { NextConfig } from "next";

const config: NextConfig = {
  turbopack: { root: __dirname },
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default config;
