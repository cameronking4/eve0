import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { discoverEveAgents, isForgeWorkspaceRoot, type DiscoveredAgent } from "./discover-agents.js";
import { discoverEveAgentsCached } from "./discover-agents-cache.js";

function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : resolve(path);
}

export function isEveProjectRoot(dir: string): boolean {
  const root = expandHome(dir);
  return (
    existsSync(join(root, "agent", "agent.ts")) ||
    (existsSync(join(root, "agent")) && existsSync(join(root, "package.json")))
  );
}

/** True when Eve is installed locally and the project can run `eve dev` / withEve. */
export function isRunnableEveAgent(dir: string): boolean {
  const root = expandHome(dir);
  return isEveProjectRoot(root) && existsSync(join(root, "node_modules", "eve", "package.json"));
}

/** True when a directory has authored files of a given extension. */
function dirHasFiles(dir: string, ext: string): boolean {
  try {
    return readdirSync(dir).some((f) => f.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * A "blank" agent is a fresh `eve init` shell: placeholder instructions and no
 * authored tools or skills. Used to offer the describe-your-agent onboarding.
 * Disk-based so it works before `eve` is installed/run.
 */
export function isBlankEveAgent(dir: string): boolean {
  const root = expandHome(dir);
  if (!isEveProjectRoot(root)) return false;

  if (dirHasFiles(join(root, "agent", "tools"), ".ts")) return false;
  if (dirHasFiles(join(root, "agent", "skills"), ".md")) return false;

  try {
    const content = readFileSync(join(root, "agent", "instructions.md"), "utf-8").trim();
    const normalized = content.toLowerCase().replace(/\s+/g, " ");
    return (
      normalized === "" ||
      normalized.includes("you are a helpful assistant") ||
      normalized === "# identity"
    );
  } catch {
    return true;
  }
}

export type EveAgentState = "missing" | "blank" | "ready";

/** Classify a directory for the onboarding flow. */
export function getEveAgentState(dir: string): EveAgentState {
  const root = expandHome(dir);
  if (!isEveProjectRoot(root)) return "missing";
  return isBlankEveAgent(root) ? "blank" : "ready";
}

function forgeConfigDir(): string {
  const dir = join(homedir(), ".config", "forge");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const LAST_PROJECT_FILE = () => join(forgeConfigDir(), "last-project");
const WORKSPACE_AGENTS_FILE = () => join(forgeConfigDir(), "workspace-agents.json");
const RECENT_WORKSPACES_FILE = () => join(forgeConfigDir(), "recent-workspaces.json");

type WorkspaceAgentMap = Record<string, string>;

function readWorkspaceAgents(): WorkspaceAgentMap {
  const path = WORKSPACE_AGENTS_FILE();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as WorkspaceAgentMap) : {};
  } catch {
    return {};
  }
}

function writeWorkspaceAgents(map: WorkspaceAgentMap): void {
  writeFileSync(WORKSPACE_AGENTS_FILE(), `${JSON.stringify(map, null, 2)}\n`, "utf-8");
}

export function getLastForgeAgent(workspaceRoot: string): string | null {
  const workspace = resolve(expandHome(workspaceRoot));
  const agent = readWorkspaceAgents()[workspace];
  if (!agent) return null;
  const resolved = resolve(expandHome(agent));
  return isEveProjectRoot(resolved) ? resolved : null;
}

export function setLastForgeAgent(workspaceRoot: string, agentRoot: string): void {
  const workspace = resolve(expandHome(workspaceRoot));
  const agent = resolve(expandHome(agentRoot));
  const map = readWorkspaceAgents();
  map[workspace] = agent;
  writeWorkspaceAgents(map);
}

export function getLastForgeProject(): string | null {
  const path = LAST_PROJECT_FILE();
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8").trim();
  if (!raw) return null;
  const resolved = expandHome(raw);
  if (isEveProjectRoot(resolved)) return resolved;
  if (isForgeWorkspaceRoot(resolved)) {
    const agents = discoverEveAgents(resolved);
    const last = getLastForgeAgent(resolved);
    if (last && agents.some((a) => a.root === last)) return last;
    return agents[0]?.root ?? null;
  }
  return null;
}

export function setLastForgeProject(root: string): void {
  writeFileSync(LAST_PROJECT_FILE(), `${resolve(expandHome(root))}\n`, "utf-8");
}

export function getRecentWorkspaces(): string[] {
  const path = RECENT_WORKSPACES_FILE();
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => resolve(expandHome(entry)))
      .filter((entry) => isForgeWorkspaceRoot(entry) || isEveProjectRoot(entry));
  } catch {
    return [];
  }
}

export function addRecentWorkspace(root: string): void {
  const resolved = resolve(expandHome(root));
  const record = isForgeWorkspaceRoot(resolved)
    ? resolved
    : isEveProjectRoot(resolved)
      ? resolved
      : null;
  if (!record) return;

  const recent = getRecentWorkspaces().filter((entry) => entry !== record);
  recent.unshift(record);
  writeFileSync(
    RECENT_WORKSPACES_FILE(),
    `${JSON.stringify(recent.slice(0, 12), null, 2)}\n`,
    "utf-8",
  );
}

/** Match agent by package name, folder name, relative path, or absolute root. */
export function resolveAgentBySelector(
  agents: readonly DiscoveredAgent[],
  selector: string,
): DiscoveredAgent | undefined {
  const needle = selector.trim().toLowerCase();
  if (!needle) return undefined;

  const byRoot = agents.find((a) => resolve(a.root).toLowerCase() === needle);
  if (byRoot) return byRoot;

  const byRelative = agents.find((a) => a.relativePath.toLowerCase() === needle);
  if (byRelative) return byRelative;

  const byName = agents.find((a) => a.name.toLowerCase() === needle);
  if (byName) return byName;

  const byFolder = agents.find(
    (a) => a.root.split("/").pop()?.toLowerCase() === needle,
  );
  if (byFolder) return byFolder;

  return agents.find(
    (a) =>
      a.name.toLowerCase().includes(needle) ||
      a.relativePath.toLowerCase().includes(needle),
  );
}

export interface ResolveForgeProjectOptions {
  /** Explicit project or workspace path (`-p`). */
  path?: string;
  /** Pre-select agent by name or path (`--agent`). */
  agent?: string;
  /** Prefer monorepo workspace over single agent in cwd (`--workspace`). */
  workspace?: boolean;
}

function selectAgentRoot(
  workspaceRoot: string,
  agents: readonly DiscoveredAgent[],
  preferredAgent?: string,
): string {
  if (preferredAgent) {
    const match = resolveAgentBySelector(agents, preferredAgent);
    if (!match) {
      const labels = agents.map((a) => a.name).join(", ");
      throw new Error(`Agent "${preferredAgent}" not found. Available: ${labels}`);
    }
    return match.root;
  }

  const last = getLastForgeAgent(workspaceRoot);
  if (last && isRunnableEveAgent(last) && agents.some((a) => a.root === last)) {
    return last;
  }

  const runnable = agents.filter((a) => isRunnableEveAgent(a.root));
  if (runnable.length > 0) return runnable[0].root;

  return agents[0]?.root ?? workspaceRoot;
}

export function walkUpForEveProject(startDir: string): string | null {
  let current = resolve(startDir);
  for (;;) {
    if (isEveProjectRoot(current)) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function hasWorkspaceManifest(dir: string): boolean {
  if (existsSync(join(dir, "pnpm-workspace.yaml"))) return true;
  try {
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { workspaces?: unknown };
    if (Array.isArray(pkg.workspaces)) return pkg.workspaces.length > 0;
    if (pkg.workspaces && typeof pkg.workspaces === "object") return true;
    return false;
  } catch {
    return false;
  }
}

export function walkUpForForgeWorkspace(startDir: string): string | null {
  let current = resolve(startDir);
  for (;;) {
    if (hasWorkspaceManifest(current) && isForgeWorkspaceRoot(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export type ProjectResolutionSource = "explicit" | "cwd" | "last";

export interface ResolvedForgeProject {
  /** Active Eve agent project root. */
  root: string;
  /** Monorepo workspace root when multiple agents are discovered. */
  workspaceRoot?: string;
  source: ProjectResolutionSource;
}

function resolveFromPath(
  path: string,
  source: ProjectResolutionSource,
  preferredAgent?: string,
  forceWorkspace?: boolean,
): ResolvedForgeProject {
  const expanded = expandHome(path);
  const resolvedPath = resolve(expanded);
  const agents = discoverEveAgentsCached(resolvedPath);

  if (isEveProjectRoot(resolvedPath) && !forceWorkspace) {
    return { root: resolvedPath, source };
  }

  if (agents.length === 1 && !forceWorkspace) {
    return { root: agents[0].root, source };
  }

  if (agents.length > 0 && (agents.length >= 2 || forceWorkspace)) {
    const root = selectAgentRoot(resolvedPath, agents, preferredAgent);
    return { root, workspaceRoot: resolvedPath, source };
  }

  if (isEveProjectRoot(resolvedPath)) {
    return { root: resolvedPath, source };
  }

  throw new Error(
    `Not an Eve project or agent workspace: no agent/ directory found under ${expanded}`,
  );
}

export function resolveForgeProjectRoot(
  options?: string | ResolveForgeProjectOptions,
): ResolvedForgeProject {
  const opts: ResolveForgeProjectOptions =
    typeof options === "string" ? { path: options } : (options ?? {});

  if (opts.path) {
    return resolveFromPath(opts.path, "explicit", opts.agent, opts.workspace);
  }

  if (opts.workspace) {
    const fromWorkspace = walkUpForForgeWorkspace(process.cwd());
    if (fromWorkspace) {
      return resolveFromPath(fromWorkspace, "cwd", opts.agent, true);
    }
    throw new Error(
      "No agent workspace found above the current directory. Pass `-p <monorepo-root>`.",
    );
  }

  const fromCwd = walkUpForEveProject(process.cwd());
  if (fromCwd && !opts.agent) {
    return { root: fromCwd, source: "cwd" };
  }

  const fromWorkspace = walkUpForForgeWorkspace(process.cwd());
  if (fromWorkspace) {
    return resolveFromPath(fromWorkspace, "cwd", opts.agent, Boolean(opts.agent));
  }

  if (fromCwd) {
    return { root: fromCwd, source: "cwd" };
  }

  const last = getLastForgeProject();
  if (last) {
    const lastProjectFile = readFileSync(LAST_PROJECT_FILE(), "utf-8").trim();
    const lastPath = expandHome(lastProjectFile);
    if (isForgeWorkspaceRoot(lastPath)) {
      return resolveFromPath(lastPath, "last", opts.agent);
    }
    return { root: last, source: "last" };
  }

  throw new Error(
    [
      "Could not find an Eve agent project.",
      "Run `forge dev` from an agent directory, pass `-p <path>`, or `forge scaffold` to create one.",
      "To try the bundled template: forge dev -p templates/minimal-agent",
    ].join(" "),
  );
}
