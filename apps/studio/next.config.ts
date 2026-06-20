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
  // @forge/core ships prebuilt dist/ — externalize on the server so catch-all
  // API routes (especially /api/eve-proxy) don't bundle ts-morph/jiti into
  // Next's dev worker pool (which caused `spawn EBADF`).
  serverExternalPackages: ["@forge/scaffolder", "@forge/core"],
};

const eveRoot = process.env.FORGE_PROJECT_ROOT;
// Only wrap with withEve when the agent exists AND eve is installed locally.
// Without node_modules/eve, withEve crashes `next dev` (common for test fixtures).
const hasEveAgent =
  Boolean(eveRoot) &&
  existsSync(join(eveRoot as string, "agent")) &&
  existsSync(join(eveRoot as string, "node_modules", "eve", "package.json"));

export default hasEveAgent ? withEve(nextConfig, { eveRoot }) : nextConfig;
