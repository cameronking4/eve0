import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Eve agents write high-churn runtime data under these dirs (workflow stream
// chunks, events, step locks — thousands of tiny files per run). The Next dev
// webpack watcher opens an fd per watched file, so watching them leaks file
// descriptors until the Studio process hits its limit and `child_process.spawn`
// (e.g. `eve init` when creating an agent) fails with `spawn EBADF`. Exclude
// them from watching (and keep webpack's default node_modules ignore).
const WATCH_IGNORED = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/.workflow-data/**",
  "**/.eve/**",
  "**/.forge/**",
  "**/.vercel/**",
];

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
  webpack(config) {
    config.watchOptions = {
      ...(config.watchOptions ?? {}),
      ignored: WATCH_IGNORED,
    };
    return config;
  },
};

const eveRoot = process.env.FORGE_PROJECT_ROOT;
// Only wrap with withEve when the agent exists AND eve is installed locally.
// Without node_modules/eve, withEve crashes `next dev` (common for test fixtures).
const hasEveAgent =
  Boolean(eveRoot) &&
  existsSync(join(eveRoot as string, "agent")) &&
  existsSync(join(eveRoot as string, "node_modules", "eve", "package.json"));

export default hasEveAgent ? withEve(nextConfig, { eveRoot }) : nextConfig;
