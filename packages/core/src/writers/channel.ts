import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeProjectFile, readProjectFile } from "../tree.js";

const execFileAsync = promisify(execFile);

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

const EVE_CHANNEL_TEMPLATE = `import { eveChannel } from "eve/channels/eve";
import { localDev, placeholderAuth, vercelOidc } from "eve/channels/auth";

export default eveChannel({
  auth: [
    localDev(),
    vercelOidc(),
    placeholderAuth(),
  ],
});
`;

export async function ensureEveChannel(projectRoot: string): Promise<{ path: string; created: boolean }> {
  const path = "agent/channels/eve.ts";
  try {
    await readProjectFile(projectRoot, path);
    return { path, created: false };
  } catch {
    await writeProjectFile(projectRoot, path, EVE_CHANNEL_TEMPLATE);
    return { path, created: true };
  }
}

export async function addChannelViaEveCli(
  projectRoot: string,
  kind: "slack" | "web",
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "npx",
      ["eve", "channels", "add", kind, "-y"],
      {
        cwd: projectRoot,
        maxBuffer: 10 * 1024 * 1024,
        env: process.env,
      },
    );
    return { ok: true, stdout, stderr };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? String(error),
    };
  }
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
