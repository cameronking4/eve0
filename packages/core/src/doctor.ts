import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FORGE_EVE_VERSION } from "./eve-cli.js";
import { fetchEveInfo } from "./manifest.js";
import { getEveAgentState, isEveProjectRoot, type EveAgentState } from "./resolve-project.js";

export type DoctorSeverity = "ok" | "info" | "warning" | "error";

export interface DoctorFinding {
  id: string;
  severity: DoctorSeverity;
  message: string;
  hint?: string;
}

export interface DoctorReport {
  projectRoot: string;
  agentState: EveAgentState;
  findings: DoctorFinding[];
  /** True when there are no error-severity findings. */
  ok: boolean;
}

/** Paths every `eve init` project should contain (Forge must not replace these). */
const EVE_INIT_REQUIRED_PATHS = [
  "package.json",
  "tsconfig.json",
  "agent/agent.ts",
  "agent/channels/eve.ts",
  "agent/instructions.md",
] as const;

const EVE_INIT_RECOMMENDED_PATHS = [
  ".gitignore",
  "pnpm-workspace.yaml",
  "AGENTS.md",
] as const;

const BASELINE_TSCONFIG = {
  module: "NodeNext",
  moduleResolution: "NodeNext",
  strict: true,
} as const;

function add(
  findings: DoctorFinding[],
  finding: DoctorFinding,
): void {
  findings.push(finding);
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function channelIdsFromDisk(agentRoot: string): string[] {
  const dir = join(agentRoot, "agent", "channels");
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();
  } catch {
    return [];
  }
}

function installedEveVersion(agentRoot: string): string | null {
  const pkgPath = join(agentRoot, "node_modules", "eve", "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

/** Non-destructive health report: Eve diagnostics + alignment vs `eve init` baseline. */
export async function runForgeDoctor(projectRoot: string): Promise<DoctorReport> {
  const root = resolve(projectRoot);
  const findings: DoctorFinding[] = [];

  if (!isEveProjectRoot(root)) {
    add(findings, {
      id: "not-eve-project",
      severity: "error",
      message: "Not an Eve agent project (missing agent/ and package.json).",
      hint: "Run `forge init` or `forge scaffold \"…\"` to create one.",
    });
    return { projectRoot: root, agentState: "missing", findings, ok: false };
  }

  const agentState = getEveAgentState(root);

  if (agentState === "blank") {
    add(findings, {
      id: "blank-agent",
      severity: "info",
      message: "Agent is a fresh `eve init` shell (placeholder instructions, no authored tools/skills).",
      hint: "Run `forge dev` to open the describe-your-agent onboarding, or edit files in Studio.",
    });
  } else if (agentState === "ready") {
    add(findings, {
      id: "agent-ready",
      severity: "ok",
      message: "Agent has authored content (instructions, tools, or skills).",
    });
  }

  for (const rel of EVE_INIT_REQUIRED_PATHS) {
    if (!existsSync(join(root, rel))) {
      add(findings, {
        id: `missing-${rel.replace(/\//g, "-")}`,
        severity: "error",
        message: `Missing Eve-owned file: ${rel}`,
        hint: "Re-run `eve init` or scaffold into a clean directory; Forge should not delete these.",
      });
    }
  }

  for (const rel of EVE_INIT_RECOMMENDED_PATHS) {
    if (!existsSync(join(root, rel))) {
      add(findings, {
        id: `missing-${rel.replace(/\//g, "-")}`,
        severity: "warning",
        message: `Missing recommended \`eve init\` file: ${rel}`,
        hint: "Compare with a fresh `eve init` output or run `forge doctor` after re-init.",
      });
    }
  }

  const pkg = readJson(join(root, "package.json"));
  if (pkg) {
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;
    if (!deps.eve) {
      add(findings, {
        id: "pkg-no-eve-dep",
        severity: "error",
        message: "package.json is missing an `eve` dependency.",
        hint: "Run `npm install` / `pnpm install` in the project, or re-run `eve init`.",
      });
    }
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    if (!scripts.build?.includes("eve")) {
      add(findings, {
        id: "pkg-scripts",
        severity: "warning",
        message: "package.json scripts may not match a standard `eve init` project.",
        hint: "Expected `build`/`dev`/`start` to invoke the Eve CLI.",
      });
    }
  }

  const tsconfig = readJson(join(root, "tsconfig.json"));
  if (tsconfig) {
    const opts = (tsconfig.compilerOptions ?? {}) as Record<string, unknown>;
    for (const [key, expected] of Object.entries(BASELINE_TSCONFIG)) {
      if (opts[key] !== expected) {
        add(findings, {
          id: `tsconfig-${key}`,
          severity: "warning",
          message: `tsconfig compilerOptions.${key} is "${String(opts[key])}" (baseline: "${expected}").`,
          hint: "Forge does not own tsconfig — align with `eve init` or accept intentional drift.",
        });
      }
    }
  }

  if (!existsSync(join(root, "node_modules", "eve"))) {
    add(findings, {
      id: "eve-not-installed",
      severity: "warning",
      message: "Eve is not installed in node_modules.",
      hint: "Run `npm install` or `pnpm install` before `forge dev` or `eve info`.",
    });
  } else {
    const installed = installedEveVersion(root);
    if (installed && installed !== FORGE_EVE_VERSION) {
      add(findings, {
        id: "eve-version-pin",
        severity: "info",
        message: `Installed eve@${installed}; Forge pins eve@${FORGE_EVE_VERSION} for bootstrap.`,
        hint: "Set FORGE_EVE_VERSION to dogfood a newer Eve, or align the project dependency.",
      });
    }
  }

  const manifest = await fetchEveInfo(root);
  for (const d of manifest.diagnostics) {
    add(findings, {
      id: `eve-${d.severity}-${findings.length}`,
      severity: d.severity === "error" ? "error" : d.severity === "warning" ? "warning" : "info",
      message: d.message,
    });
  }

  const diskChannels = channelIdsFromDisk(root);
  const infoChannelIds = [...new Set(manifest.channels.map((c) => c.id))].sort();
  const diskOnly = diskChannels.filter((id) => !infoChannelIds.includes(id));
  const infoOnly = infoChannelIds.filter((id) => !diskChannels.includes(id));

  if (diskOnly.length || infoOnly.length) {
    add(findings, {
      id: "channels-drift",
      severity: "warning",
      message: `Channel mismatch — disk: [${diskChannels.join(", ")}], eve info: [${infoChannelIds.join(", ")}].`,
      hint: "Run `eve info --json` and check agent/channels/*.ts; add missing channels with `eve channels add`.",
    });
  } else if (diskChannels.length) {
    add(findings, {
      id: "channels-ok",
      severity: "ok",
      message: `Channels aligned (${diskChannels.join(", ")}).`,
    });
  }

  const ok = !findings.some((f) => f.severity === "error");
  return { projectRoot: root, agentState, findings, ok };
}
