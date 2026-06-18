import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { existsSync } from "node:fs";
import { join } from "node:path";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle so the CLI can ship + run the
  // Studio from an npm install without the monorepo or a dev toolchain.
  output: "standalone",
  // Trace workspace deps from the monorepo root into the standalone bundle.
  outputFileTracingRoot: process.env.FORGE_STUDIO_TRACING_ROOT || undefined,
  transpilePackages: ["@forge/core"],
  // Keep the scaffolder (and its ai@4 dependency) external so it does not
  // collide with Studio's own ai@7 during bundling.
  serverExternalPackages: ["@forge/scaffolder"],
};

const eveRoot = process.env.FORGE_PROJECT_ROOT;
// Only wrap with withEve when the agent exists AND eve is installed locally.
// Without node_modules/eve, withEve crashes `next dev` (common for test fixtures).
const hasEveAgent =
  Boolean(eveRoot) &&
  existsSync(join(eveRoot as string, "agent")) &&
  existsSync(join(eveRoot as string, "node_modules", "eve", "package.json"));

export default hasEveAgent ? withEve(nextConfig, { eveRoot }) : nextConfig;
