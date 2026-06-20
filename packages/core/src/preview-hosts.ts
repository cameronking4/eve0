import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { resolveEveInvocation } from "./eve-cli.js";
import type { DiscoveredAgent } from "./discover-agents.js";
import { isRunnableEveAgent } from "./resolve-project.js";

const EVE_HEALTH_PATH = "/eve/v1/health";
const SERVER_URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;
const START_TIMEOUT_MS = 180_000;
const MANIFEST_FILE = "preview-hosts.json";
const FORGE_DEV_SERVER_ORIGIN_FILE = "dev-server-origin.json";

export interface PreviewHostsManifest {
  workspaceRoot: string;
  primaryRoot: string;
  /** Absolute agent root → Eve origin. Empty string = same-origin via withEve. */
  hosts: Record<string, string>;
  updatedAt: string;
}

const runningProcesses = new Map<string, ChildProcess>();
const runningOrigins = new Map<string, string>();
const pendingSpawns = new Map<string, Promise<string>>();

function updateManifestHost(agentRoot: string, origin: string): void {
  const workspaceRoot = process.env["FORGE_WORKSPACE_ROOT"];
  if (!workspaceRoot) return;
  const manifest = readPreviewHostsManifest(workspaceRoot);
  if (!manifest) return;
  manifest.hosts[resolve(agentRoot)] = origin;
  manifest.updatedAt = new Date().toISOString();
  writePreviewHostsManifest(manifest);
}

export interface ResolveDevServerOriginOptions {
  workspaceRoot?: string;
  primaryRoot?: string;
  studioOrigin?: string;
}

function forgeDevServerOriginPath(agentRoot: string): string {
  return join(resolve(agentRoot), ".forge", FORGE_DEV_SERVER_ORIGIN_FILE);
}

function readForgeDevServerOrigin(agentRoot: string): string | undefined {
  const path = forgeDevServerOriginPath(agentRoot);
  if (!existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as { origin?: unknown };
    return typeof raw.origin === "string" ? raw.origin : undefined;
  } catch {
    return undefined;
  }
}

function writeForgeDevServerOrigin(agentRoot: string, origin: string): void {
  const path = forgeDevServerOriginPath(agentRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({ origin, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf-8",
  );
}

async function readDevProcessPid(agentRoot: string): Promise<number | undefined> {
  const pidPath = join(resolve(agentRoot), ".eve/dev-process.pid");
  if (!existsSync(pidPath)) return undefined;
  try {
    const raw = readFileSync(pidPath, "utf-8").trim();
    const pid = Number.parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) return undefined;
    process.kill(pid, 0);
    return pid;
  } catch {
    return undefined;
  }
}

async function discoverOriginFromProcessPid(pid: number): Promise<string | undefined> {
  if (process.platform === "win32") return undefined;
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync(
      "lsof",
      ["-Pan", `-p${pid}`, "-iTCP", "-sTCP:LISTEN"],
      { encoding: "utf8" },
    );
    for (const line of stdout.split("\n")) {
      const match = line.match(/(?:127\.0\.0\.1|localhost|\*):(\d+)\s+\(LISTEN\)/);
      if (!match) continue;
      const origin = `http://127.0.0.1:${match[1]}`;
      if (await isHealthy(origin)) return origin;
    }
  } catch {
    // lsof unavailable or process exited
  }
  return undefined;
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

/** Resolve a healthy Eve dev server URL when one is already running for this agent. */
export async function resolveActiveDevServerOrigin(
  agentRoot: string,
  options?: ResolveDevServerOriginOptions,
): Promise<string | undefined> {
  const resolved = resolve(agentRoot);
  const candidates: string[] = [];

  const inMemory = runningOrigins.get(resolved);
  if (inMemory) candidates.push(inMemory);

  const fromEve = await readDevServerOrigin(resolved);
  if (fromEve) return fromEve;

  const fromForge = readForgeDevServerOrigin(resolved);
  if (fromForge) candidates.push(fromForge);

  const manifest = resolvePreviewHostsManifest(options?.workspaceRoot);
  const fromManifest = lookupPreviewHost(resolved, manifest);
  if (fromManifest && fromManifest.length > 0) candidates.push(fromManifest);

  if (
    options?.studioOrigin &&
    options?.primaryRoot &&
    resolve(options.primaryRoot) === resolved
  ) {
    candidates.push(options.studioOrigin);
  }

  for (const origin of candidates) {
    if (await isHealthy(origin)) return origin;
  }

  const pid = await readDevProcessPid(resolved);
  if (pid !== undefined) {
    return discoverOriginFromProcessPid(pid);
  }

  return undefined;
}

export async function spawnEveDevServer(agentRoot: string): Promise<string> {
  const resolved = resolve(agentRoot);
  const existing = await resolveActiveDevServerOrigin(resolved);
  if (existing) return existing;

  const pending = pendingSpawns.get(resolved);
  if (pending) return pending;

  const spawnPromise = new Promise<string>((resolvePromise, reject) => {
    const { cmd, prefix } = resolveEveInvocation(resolved);
    const proc = spawn(cmd, [...prefix, "dev", "--no-ui", "--port", "0"], {
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
          finish(() => {
            writeForgeDevServerOrigin(resolved, origin);
            runningOrigins.set(resolved, origin);
            updateManifestHost(resolved, origin);
            resolvePromise(origin);
          });
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

  pendingSpawns.set(resolved, spawnPromise);
  try {
    return await spawnPromise;
  } finally {
    pendingSpawns.delete(resolved);
  }
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
    if (!isRunnableEveAgent(root)) continue;
    try {
      hosts[root] = await spawnEveDevServer(root);
    } catch {
      // Non-fatal: lazy-spawn via /api/eve-proxy when the user switches agents.
    }
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
