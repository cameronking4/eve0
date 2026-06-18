import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DiscoveredAgent } from "./discover-agents.js";

const EVE_HEALTH_PATH = "/eve/v1/health";
const SERVER_URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;
const START_TIMEOUT_MS = 180_000;
const MANIFEST_FILE = "preview-hosts.json";

export interface PreviewHostsManifest {
  workspaceRoot: string;
  primaryRoot: string;
  /** Absolute agent root → Eve origin. Empty string = same-origin via withEve. */
  hosts: Record<string, string>;
  updatedAt: string;
}

const runningProcesses = new Map<string, ChildProcess>();

function findEveBinary(): string {
  const require = createRequire(fileURLToPath(import.meta.url));
  const pkgPath = require.resolve("eve/package.json");
  return join(dirname(pkgPath), "bin/eve.js");
}

export function previewHostsManifestPath(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), ".forge", MANIFEST_FILE);
}

export function readPreviewHostsManifest(workspaceRoot: string): PreviewHostsManifest | null {
  const path = previewHostsManifestPath(workspaceRoot);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as PreviewHostsManifest;
    if (!raw.hosts || typeof raw.hosts !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

export function writePreviewHostsManifest(manifest: PreviewHostsManifest): void {
  const path = previewHostsManifestPath(manifest.workspaceRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

function parseLoopbackOrigin(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const isLoopback =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";
    if (!isLoopback || !parsed.port) return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

async function isHealthy(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}${EVE_HEALTH_PATH}`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function readDevServerOrigin(agentRoot: string): Promise<string | undefined> {
  const registryPath = join(agentRoot, ".eve/next-dev-server.json");
  if (!existsSync(registryPath)) return undefined;

  try {
    const raw = JSON.parse(readFileSync(registryPath, "utf-8")) as { origin?: unknown };
    if (typeof raw.origin !== "string") return undefined;
    return (await isHealthy(raw.origin)) ? raw.origin : undefined;
  } catch {
    return undefined;
  }
}

export async function spawnEveDevServer(agentRoot: string): Promise<string> {
  const resolved = resolve(agentRoot);
  const existing = await readDevServerOrigin(resolved);
  if (existing) return existing;

  return new Promise((resolvePromise, reject) => {
    const proc = spawn(process.execPath, [findEveBinary(), "dev", "--no-ui", "--port", "0"], {
      cwd: resolved,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      detached: false,
    });

    runningProcesses.set(resolved, proc);

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    const timeout = setTimeout(() => {
      proc.kill();
      runningProcesses.delete(resolved);
      finish(() => reject(new Error(`Timed out starting eve dev for ${resolved}`)));
    }, START_TIMEOUT_MS);

    const handleOutput = (chunk: Buffer) => {
      for (const match of chunk.toString("utf8").matchAll(SERVER_URL_PATTERN)) {
        const origin = parseLoopbackOrigin(match[0]);
        if (origin) {
          finish(() => resolvePromise(origin));
          return;
        }
      }
    };

    proc.stdout?.on("data", handleOutput);
    proc.stderr?.on("data", handleOutput);
    proc.on("error", (error) => {
      runningProcesses.delete(resolved);
      finish(() => reject(error));
    });
    proc.on("exit", (code) => {
      runningProcesses.delete(resolved);
      if (!settled) {
        finish(() => reject(new Error(`eve dev exited with code ${String(code)} for ${resolved}`)));
      }
    });
  });
}

export function lookupPreviewHost(
  agentRoot: string,
  manifest?: PreviewHostsManifest | null,
): string | undefined {
  if (!manifest) return undefined;
  const key = resolve(agentRoot);
  if (key in manifest.hosts) return manifest.hosts[key];
  return undefined;
}

/**
 * Warm Eve preview servers for every agent in a workspace.
 * Primary agent uses same-origin withEve (empty host). Others get dedicated eve dev processes.
 */
export async function warmPreviewHosts(
  workspaceRoot: string,
  agents: readonly DiscoveredAgent[],
  primaryRoot: string,
): Promise<PreviewHostsManifest> {
  const resolvedWorkspace = resolve(workspaceRoot);
  const resolvedPrimary = resolve(primaryRoot);
  const hosts: Record<string, string> = {};

  for (const agent of agents) {
    const root = resolve(agent.root);
    if (root === resolvedPrimary) {
      hosts[root] = "";
      continue;
    }
    hosts[root] = await spawnEveDevServer(root);
  }

  const manifest: PreviewHostsManifest = {
    workspaceRoot: resolvedWorkspace,
    primaryRoot: resolvedPrimary,
    hosts,
    updatedAt: new Date().toISOString(),
  };

  writePreviewHostsManifest(manifest);
  return manifest;
}

export function previewHostsFromEnv(): PreviewHostsManifest | null {
  const raw = process.env.FORGE_PREVIEW_HOSTS;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PreviewHostsManifest;
  } catch {
    return null;
  }
}

export function resolvePreviewHostsManifest(workspaceRoot?: string): PreviewHostsManifest | null {
  return (
    previewHostsFromEnv() ??
    (workspaceRoot ? readPreviewHostsManifest(workspaceRoot) : null)
  );
}

export async function ensurePreviewHost(
  agentRoot: string,
  primaryRoot?: string,
  workspaceRoot?: string,
): Promise<string> {
  const resolved = resolve(agentRoot);
  const manifest = resolvePreviewHostsManifest(workspaceRoot);

  const fromManifest = lookupPreviewHost(resolved, manifest);
  if (fromManifest !== undefined) return fromManifest;

  if (primaryRoot && resolve(primaryRoot) === resolved) {
    return "";
  }

  return spawnEveDevServer(resolved);
}

export function stopPreviewHostProcesses(): void {
  for (const proc of runningProcesses.values()) {
    if (!proc.killed) proc.kill("SIGTERM");
  }
  runningProcesses.clear();
}
