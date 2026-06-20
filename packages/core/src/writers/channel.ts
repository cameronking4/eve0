import { runEve } from "../eve-cli.js";
import { fetchEveInfo } from "../manifest.js";
import { stageProjectFileDeletion, type StagingManifest } from "../staging.js";
import type { EveChannelInfo } from "../types.js";

export const CHANNEL_CATALOG = [
  {
    kind: "eve",
    label: "Eve (dev chat)",
    description: "Local dev channel for `eve dev` and the Forge preview chat.",
    docsUrl: "https://eve.dev/docs/channels/eve",
  },
  {
    kind: "slack",
    label: "Slack",
    description: "Let users talk to your agent in Slack. Requires Vercel Connect.",
    docsUrl: "https://eve.dev/docs/channels/slack",
    cli: true,
  },
  {
    kind: "web",
    label: "Web",
    description: "Next.js web UI for your agent. Scaffolds a frontend channel.",
    docsUrl: "https://eve.dev/docs/tutorial/ship-it",
    cli: true,
  },
] as const;

/** Channel kinds Forge can create via `eve channels add`. Keep in sync with Eve. */
export const EVE_CLI_CHANNEL_KINDS = ["slack", "web"] as const;
export type EveCliChannelKind = (typeof EVE_CLI_CHANNEL_KINDS)[number];

export async function addChannelViaEveCli(
  projectRoot: string,
  kind: EveCliChannelKind,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr, exitCode } = await runEve({
      cwd: projectRoot,
      args: ["channels", "add", kind, "-y"],
      maxBuffer: 10 * 1024 * 1024,
    });
    return { ok: exitCode === 0, stdout, stderr };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? String(error),
    };
  }
}

/**
 * P3/P4: the Eve channel is created by `eve init`, never by a Forge template.
 * Verify it exists by asking the authoritative manifest.
 */
export async function verifyEveChannel(
  projectRoot: string,
): Promise<{ present: boolean; channels: string[] }> {
  const manifest = await fetchEveInfo(projectRoot);
  const channels = manifest.channels.map((c) => c.id);
  return { present: channels.includes("eve"), channels };
}

export async function listChannelFiles(projectRoot: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = join(projectRoot, "agent/channels");
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".ts")).map((f) => `agent/channels/${f}`);
  } catch {
    return [];
  }
}

/** The Eve dev channel is required for local preview and must not be removed. */
export function isProtectedChannel(channel: Pick<EveChannelInfo, "id" | "sourcePath">): boolean {
  return (
    channel.id === "eve" ||
    channel.sourcePath === "agent/channels/eve.ts" ||
    channel.sourcePath?.endsWith("/channels/eve.ts") === true
  );
}

export async function stageChannelDeletion(
  projectRoot: string,
  sourcePath: string,
): Promise<StagingManifest> {
  const normalized = sourcePath.replace(/^\/+/, "");
  if (!normalized.startsWith("agent/channels/") || !normalized.endsWith(".ts")) {
    throw new Error(`Not a channel file: ${sourcePath}`);
  }
  const id = normalized.replace(/^agent\/channels\//, "").replace(/\.ts$/, "");
  if (id === "eve") {
    throw new Error("The Eve channel is required for local preview and cannot be deleted.");
  }
  return stageProjectFileDeletion(projectRoot, normalized);
}
