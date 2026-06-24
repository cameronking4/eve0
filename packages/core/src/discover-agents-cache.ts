import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { discoverEveAgents, type DiscoveredAgent } from "./discover-agents.js";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  ".eve",
  ".turbo",
  ".output",
  "coverage",
  ".forge",
  ".vercel",
  // Cursor/Claude skill checkouts (e.g. a full vendored copy of the Eve
  // framework source) — thousands of source files we must never watch.
  ".agents",
  // Eve writes high-churn durable-workflow data here (stream chunks, events,
  // step locks — thousands of tiny files per run). Watching it makes chokidar
  // hold an open fd per file, leaking descriptors until the long-running Studio
  // process exhausts its fd limit and `child_process.spawn` (e.g. `eve init`
  // when creating a new agent) fails with `spawn EBADF`.
  ".workflow-data",
]);

interface CacheEntry {
  agents: DiscoveredAgent[];
  scannedAt: number;
}

const cache = new Map<string, CacheEntry>();
const watchers = new Map<string, FSWatcher>();

function cacheKey(workspaceRoot: string): string {
  return resolve(workspaceRoot);
}

export function invalidateDiscoveryCache(workspaceRoot?: string): void {
  if (workspaceRoot) {
    cache.delete(cacheKey(workspaceRoot));
    return;
  }
  cache.clear();
}

export function discoverEveAgentsCached(workspaceRoot: string): DiscoveredAgent[] {
  const key = cacheKey(workspaceRoot);
  const hit = cache.get(key);
  if (hit) return hit.agents;

  const agents = discoverEveAgents(workspaceRoot);
  cache.set(key, { agents, scannedAt: Date.now() });
  return agents;
}

function isAgentMarkerPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized.endsWith("/agent/agent.ts") || normalized.endsWith("/agent\\agent.ts");
}

/**
 * Invalidate discovery cache when agent trees are added or removed under a workspace.
 */
export function watchWorkspaceAgents(
  workspaceRoot: string,
  onChange: () => void,
  debounceMs = 400,
): FSWatcher {
  const key = cacheKey(workspaceRoot);
  const existing = watchers.get(key);
  if (existing) return existing;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = (path: string) => {
    if (!isAgentMarkerPath(path)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      invalidateDiscoveryCache(workspaceRoot);
      onChange();
    }, debounceMs);
  };

  const watcher = chokidar.watch(resolve(workspaceRoot), {
    ignoreInitial: true,
    depth: 12,
    awaitWriteFinish: { stabilityThreshold: 200 },
    ignored: (path) => {
      const parts = path.split(/[/\\]/);
      return parts.some((part) => SKIP_DIRS.has(part));
    },
  });

  watcher
    .on("add", notify)
    .on("unlink", notify)
    .on("addDir", (path) => {
      if (basename(path) === "agent" && existsSync(join(path, "agent.ts"))) {
        notify(join(path, "agent.ts"));
      }
    })
    .on("unlinkDir", (path) => {
      if (basename(path) === "agent") {
        notify(join(path, "agent.ts"));
      }
    });

  watchers.set(key, watcher);
  return watcher;
}

export function stopWorkspaceAgentWatch(workspaceRoot?: string): void {
  if (workspaceRoot) {
    const key = cacheKey(workspaceRoot);
    watchers.get(key)?.close();
    watchers.delete(key);
    return;
  }
  for (const watcher of watchers.values()) watcher.close();
  watchers.clear();
}
