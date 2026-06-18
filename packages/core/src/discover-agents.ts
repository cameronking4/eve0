import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { isEveProjectRoot } from "./resolve-project.js";

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
]);

/** Subtrees that are never scanned for agents (scaffolds, examples, etc.). */
const SKIP_AGENT_SUBTREES = new Set(["templates"]);

export interface DiscoveredAgent {
  root: string;
  name: string;
  relativePath: string;
}

function readAgentName(projectRoot: string): string {
  try {
    const pkgPath = join(projectRoot, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
      if (typeof pkg.name === "string" && pkg.name.length > 0) {
        return pkg.name.replace(/^@[^/]+\//, "");
      }
    }
  } catch {
    // ignore malformed package.json
  }
  return basename(projectRoot);
}

/**
 * Walk a directory tree and return every Eve agent project root
 * (a folder containing `agent/agent.ts`).
 */
export function discoverEveAgents(workspaceRoot: string): DiscoveredAgent[] {
  const root = resolve(workspaceRoot);
  const found = new Map<string, DiscoveredAgent>();

  function addProject(projectRoot: string): void {
    const resolved = resolve(projectRoot);
    if (!isEveProjectRoot(resolved) || found.has(resolved)) return;
    found.set(resolved, {
      root: resolved,
      name: readAgentName(resolved),
      relativePath: relative(root, resolved) || ".",
    });
  }

  function walk(dir: string, depth: number): void {
    if (depth > 12) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_AGENT_SUBTREES.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      if (entry.name === "agent" && existsSync(join(fullPath, "agent.ts"))) {
        addProject(dir);
        continue;
      }

      walk(fullPath, depth + 1);
    }
  }

  addProject(root);
  walk(root, 0);

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** True when the path is a monorepo-style workspace (2+ agents in subfolders). */
export function isForgeWorkspaceRoot(dir: string): boolean {
  const resolved = resolve(dir);
  if (isEveProjectRoot(resolved)) return false;
  return discoverEveAgents(resolved).length >= 2;
}
