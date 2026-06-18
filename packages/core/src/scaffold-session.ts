import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export type ScaffoldStepId =
  | "prepare"
  | "eve_init"
  | "install_deps"
  | "plan"
  | "apply_content"
  | "channels"
  | "validate"
  | "repair"
  | "finalize";

export type ScaffoldStepStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface ScaffoldStepRecord {
  id: ScaffoldStepId;
  label: string;
  status: ScaffoldStepStatus;
  detail?: string;
  startedAt?: string;
  completedAt?: string;
}

export type ScaffoldSessionStatus =
  | "pending"
  | "running"
  | "complete"
  | "failed"
  | "archived";

export type ScaffoldPlanSource = "example" | "offline" | "llm";

export interface ScaffoldSessionResult {
  projectRoot: string;
  name?: string;
  planSource?: ScaffoldPlanSource;
  diagnostics: string[];
  newFiles: string[];
  channels: string[];
}

export interface ScaffoldSession {
  id: string;
  prompt: string;
  outputDir: string;
  status: ScaffoldSessionStatus;
  planSource?: ScaffoldPlanSource;
  startedAt: string;
  completedAt?: string;
  currentStep?: ScaffoldStepId;
  steps: ScaffoldStepRecord[];
  result?: ScaffoldSessionResult;
  error?: string;
}

export const SCAFFOLD_STEP_LABELS: Record<ScaffoldStepId, string> = {
  prepare: "Prepare output directory",
  eve_init: "Create Eve project (eve init)",
  install_deps: "Install dependencies",
  plan: "Plan the agent",
  apply_content: "Write agent content",
  channels: "Add channels",
  validate: "Validate (eve info)",
  repair: "Repair plan",
  finalize: "Finalize",
};

export const SCAFFOLD_STEP_ORDER: ScaffoldStepId[] = [
  "prepare",
  "eve_init",
  "install_deps",
  "plan",
  "apply_content",
  "channels",
  "validate",
  "repair",
  "finalize",
];

function defaultSteps(): ScaffoldStepRecord[] {
  return SCAFFOLD_STEP_ORDER.map((id) => ({
    id,
    label: SCAFFOLD_STEP_LABELS[id],
    status: "pending" as ScaffoldStepStatus,
  }));
}

export function createSessionId(): string {
  return `scf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createScaffoldSession(opts: {
  prompt: string;
  outputDir: string;
  id?: string;
}): ScaffoldSession {
  return {
    id: opts.id ?? createSessionId(),
    prompt: opts.prompt,
    outputDir: resolve(opts.outputDir),
    status: "pending",
    startedAt: new Date().toISOString(),
    steps: defaultSteps(),
  };
}

/** Primary location once the output dir exists. */
export function scaffoldSessionPath(outputDir: string): string {
  return join(resolve(outputDir), ".forge", "scaffold-session.json");
}

/** Pre-creation store keyed by id under a workspace (M-UX1 resume). */
export function scaffoldSessionStorePath(workspaceRoot: string, id: string): string {
  return join(resolve(workspaceRoot), ".forge", "scaffold", `${id}.json`);
}

/**
 * Temp store used before `eve init` creates the project — the output dir must be
 * empty for `eve init`, so we cannot write the session there yet.
 */
export function stagedScaffoldSessionPath(id: string): string {
  return join(tmpdir(), "forge-scaffold", `${id}.json`);
}

async function writeSessionTo(path: string, session: ScaffoldSession): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(session, null, 2)}\n`, "utf-8");
}

export async function writeScaffoldSession(session: ScaffoldSession): Promise<void> {
  await writeSessionTo(scaffoldSessionPath(session.outputDir), session);
}

export async function writeStagedScaffoldSession(session: ScaffoldSession): Promise<void> {
  await writeSessionTo(stagedScaffoldSessionPath(session.id), session);
}

export async function readStagedScaffoldSession(id: string): Promise<ScaffoldSession | null> {
  const path = stagedScaffoldSessionPath(id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf-8")) as ScaffoldSession;
  } catch {
    return null;
  }
}

export async function readScaffoldSession(outputDir: string): Promise<ScaffoldSession | null> {
  const path = scaffoldSessionPath(outputDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf-8")) as ScaffoldSession;
  } catch {
    return null;
  }
}

/** Find a session by id, scanning both the output-dir file and the workspace store. */
export async function findScaffoldSession(
  workspaceRoot: string,
  id: string,
): Promise<ScaffoldSession | null> {
  for (const storePath of [scaffoldSessionStorePath(workspaceRoot, id), stagedScaffoldSessionPath(id)]) {
    if (existsSync(storePath)) {
      try {
        return JSON.parse(await readFile(storePath, "utf-8")) as ScaffoldSession;
      } catch {
        // fall through
      }
    }
  }
  const storeDir = join(resolve(workspaceRoot), ".forge", "scaffold");
  if (existsSync(storeDir)) {
    try {
      const files = await readdir(storeDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const session = JSON.parse(
          await readFile(join(storeDir, file), "utf-8"),
        ) as ScaffoldSession;
        if (session.id === id) return session;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export function markStep(
  session: ScaffoldSession,
  id: ScaffoldStepId,
  status: ScaffoldStepStatus,
  detail?: string,
): ScaffoldSession {
  const now = new Date().toISOString();
  session.steps = session.steps.map((step) => {
    if (step.id !== id) return step;
    const next: ScaffoldStepRecord = { ...step, status };
    if (detail !== undefined) next.detail = detail;
    if (status === "running" && !next.startedAt) next.startedAt = now;
    if (status === "done" || status === "failed" || status === "skipped") {
      next.completedAt = now;
    }
    return next;
  });
  if (status === "running") session.currentStep = id;
  return session;
}
