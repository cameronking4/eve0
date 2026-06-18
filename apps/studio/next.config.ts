import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  transpilePackages: ["@forge/core"],
};

const eveRoot = process.env.FORGE_PROJECT_ROOT;

export default withEve(nextConfig, eveRoot ? { eveRoot } : {});
