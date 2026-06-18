import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  addChannelViaEveCli,
  createScaffoldSession,
  EVE_CLI_CHANNEL_KINDS,
  fetchEveInfo,
  markStep,
  runEve,
  setLastForgeProject,
  writeAgentModel,
  writeScaffoldSession,
  writeStagedScaffoldSession,
  type EveCliChannelKind,
  type ScaffoldPlanSource,
  type ScaffoldSession,
  type ScaffoldSessionResult,
  type ScaffoldStepId,
  type ScaffoldStepRecord,
} from "@forge/core";
import {
  generateConnectionsMd,
  generateEnvExample,
  generateEvalsConfig,
  generateSkillFile,
  generateSmokeEval,
  generateToolFile,
} from "./codegen.js";
import { createPlanFromNL, generatePlanObject, getPlannerModel } from "./llm.js";
import type { ScaffoldPlan } from "./plan.js";

export type ScaffoldEvent =
  | { type: "step"; step: ScaffoldStepRecord }
  | { type: "log"; line: string }
  | { type: "plan"; planSource: ScaffoldPlanSource; name: string; plan: ScaffoldPlan }
  | { type: "complete"; result: ScaffoldSessionResult }
  | { type: "error"; error: string; step?: ScaffoldStepId };

export type ScaffoldEventHandler = (event: ScaffoldEvent) => void;

export interface RunScaffoldOptions {
  /** Allow scaffolding into a non-empty directory (Forge-written paths only). */
  force?: boolean;
  /** Skip LLM repair pass even when an API key is present. */
  noRepair?: boolean;
  /**
   * Layer content onto an existing Eve project (blank-agent onboarding):
   * skip `eve init` + install and just apply plan content in place.
   */
  existingProject?: boolean;
}

class StepFailure extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "StepFailure";
  }
}

function detectPackageManager(dir: string): "pnpm" | "npm" | "yarn" {
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  if (existsSync(join(dir, "package-lock.json"))) return "npm";
  return "pnpm";
}

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  onLine?: (line: string) => void,
): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let buf = "";
    const handle = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      output += text;
      if (!onLine) return;
      buf += text;
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        onLine(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
    };
    child.stdout?.on("data", handle);
    child.stderr?.on("data", handle);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (buf && onLine) onLine(buf);
      resolvePromise({ exitCode: code ?? 0, output });
    });
  });
}

// Forge-owned metadata that doesn't count toward "non-empty" (M-S1 allowlist).
const FORGE_OWNED_ENTRIES = new Set([".forge", ".DS_Store"]);

async function isDirNonEmpty(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return false;
  try {
    const entries = await readdir(dir);
    return entries.some((entry) => !FORGE_OWNED_ENTRIES.has(entry));
  } catch {
    return false;
  }
}

function envKeys(text: string): Set<string> {
  const keys = new Set<string>();
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

/** Merge generated env vars into an existing .env.example, preserving existing keys. */
function mergeEnvExample(existing: string, generated: string): string {
  if (!existing.trim()) return generated;
  const have = envKeys(existing);
  const additions: string[] = [];
  const genLines = generated.split("\n");
  for (let i = 0; i < genLines.length; i++) {
    const match = genLines[i].match(/^([A-Z0-9_]+)=/);
    if (match && !have.has(match[1])) {
      const comment = i > 0 && genLines[i - 1].startsWith("#") ? `${genLines[i - 1]}\n` : "";
      additions.push(`${comment}${genLines[i]}`);
    }
  }
  if (additions.length === 0) return existing;
  const base = existing.endsWith("\n") ? existing : `${existing}\n`;
  return `${base}\n# Added by Forge scaffold\n${additions.join("\n")}\n`;
}

async function writeContent(
  projectRoot: string,
  relPath: string,
  content: string,
  newFiles: string[],
): Promise<void> {
  const abs = join(projectRoot, relPath);
  const existed = existsSync(abs);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf-8");
  if (!existed) newFiles.push(relPath);
}

/**
 * Write only the semantic content Forge owns (P2). Never touches `package.json`,
 * `tsconfig.json`, `.gitignore`, `pnpm-workspace.yaml`, or `agent/channels/eve.ts` —
 * those belong to `eve init` (P1).
 */
export async function applyPlanContent(
  projectRoot: string,
  plan: ScaffoldPlan,
): Promise<{ newFiles: string[] }> {
  const newFiles: string[] = [];

  // Rewrite the model in place (ts-morph), preserving the eve init agent.ts.
  await writeAgentModel(projectRoot, plan.model);

  await writeContent(
    projectRoot,
    "agent/instructions.md",
    `${plan.instructions.trim()}\n`,
    newFiles,
  );

  for (const tool of plan.tools) {
    await writeContent(projectRoot, `agent/tools/${tool.name}.ts`, generateToolFile(tool), newFiles);
  }

  for (const skill of plan.skills) {
    await writeContent(projectRoot, `agent/skills/${skill.slug}.md`, generateSkillFile(skill), newFiles);
  }

  await writeContent(projectRoot, "evals/evals.config.ts", generateEvalsConfig(), newFiles);
  await writeContent(projectRoot, "evals/smoke.eval.ts", generateSmokeEval(plan), newFiles);

  const generatedEnv = generateEnvExample(plan.envVars);
  let existingEnv = "";
  try {
    existingEnv = await readFile(join(projectRoot, ".env.example"), "utf-8");
  } catch {
    // none yet
  }
  await writeContent(projectRoot, ".env.example", mergeEnvExample(existingEnv, generatedEnv), newFiles);

  await writeContent(projectRoot, "CONNECTIONS.md", generateConnectionsMd(plan), newFiles);

  return { newFiles };
}

function planChannelKinds(plan: ScaffoldPlan): EveCliChannelKind[] {
  const kinds = new Set<EveCliChannelKind>();
  for (const channel of plan.channels) {
    if ((EVE_CLI_CHANNEL_KINDS as readonly string[]).includes(channel.kind)) {
      kinds.add(channel.kind as EveCliChannelKind);
    }
  }
  return [...kinds];
}

/**
 * The single scaffold pipeline (P8). The CLI `--sync` path and the Studio wizard
 * both call this with their own event handler.
 */
export async function runScaffoldPipeline(
  session: ScaffoldSession,
  onEvent: ScaffoldEventHandler = () => {},
  options: RunScaffoldOptions = {},
): Promise<ScaffoldSession> {
  const projectRoot = resolve(session.outputDir);
  const name = basename(projectRoot);
  const parent = dirname(projectRoot);
  const newFiles: string[] = [];
  let plan: ScaffoldPlan | undefined;
  let planSource: ScaffoldPlanSource | undefined;
  let channels: string[] = [];
  let diagnostics: string[] = [];
  // `eve init` requires an empty dir, so stage the session in temp until it exists.
  let projectReady = false;
  const persist = async () => {
    // Always keep the id-keyed staged copy current so the API can resolve a
    // session by id (even across server restarts); also write the canonical
    // copy inside the project once it exists.
    await writeStagedScaffoldSession(session);
    if (projectReady) await writeScaffoldSession(session);
  };

  session.status = "running";
  await persist();

  const emitStep = (id: ScaffoldStepId) => {
    const step = session.steps.find((s) => s.id === id);
    if (step) onEvent({ type: "step", step });
  };
  const log = (line: string) => onEvent({ type: "log", line });

  const step = async (
    id: ScaffoldStepId,
    fn: () => Promise<{ status?: "done" | "skipped"; detail?: string } | void>,
  ): Promise<void> => {
    markStep(session, id, "running");
    emitStep(id);
    await persist();
    try {
      const outcome = (await fn()) ?? {};
      markStep(session, id, outcome.status ?? "done", outcome.detail);
      emitStep(id);
      await persist();
    } catch (error) {
      const detail =
        error instanceof StepFailure
          ? `${error.message}${error.hint ? ` — ${error.hint}` : ""}`
          : error instanceof Error
            ? error.message
            : String(error);
      markStep(session, id, "failed", detail);
      emitStep(id);
      session.status = "failed";
      session.error = detail;
      await persist();
      onEvent({ type: "error", error: detail, step: id });
      throw error;
    }
  };

  try {
    let initMode: { cwd: string; args: string[] } = { cwd: parent, args: ["init", name] };

    await step("prepare", async () => {
      if (options.existingProject) {
        if (!existsSync(join(projectRoot, "package.json"))) {
          throw new StepFailure(
            `Not an existing Eve project: ${projectRoot}`,
            "Run `forge init` first, or scaffold into a new directory.",
          );
        }
        projectReady = true;
        return { detail: `existing project: ${projectRoot}` };
      }
      if ((await isDirNonEmpty(projectRoot)) && !options.force) {
        throw new StepFailure(
          `Output directory is not empty: ${projectRoot}`,
          "Re-run with --force to scaffold into it, or pick an empty directory.",
        );
      }
      await mkdir(parent, { recursive: true });
      if (existsSync(projectRoot)) {
        // Dir exists (possibly pre-created by -o); add an agent in place.
        initMode = { cwd: projectRoot, args: ["init", "."] };
      }
      return { detail: projectRoot };
    });

    await step("eve_init", async () => {
      if (options.existingProject) {
        return { status: "skipped", detail: "existing project" };
      }
      const result = await runEve({
        cwd: initMode.cwd,
        args: initMode.args,
        timeoutMs: 300_000,
        onLine: log,
      });
      projectReady = existsSync(join(projectRoot, "package.json"));
      if (result.exitCode !== 0) {
        // `eve init` scaffolds files first, then installs deps. A non-zero exit
        // with the project files present means only the dependency install
        // failed (e.g. the local pnpm is too old for Eve's pnpm-workspace.yaml).
        // The install_deps step recovers; only a missing project is fatal.
        if (!projectReady) {
          throw new StepFailure(
            `eve ${initMode.args.join(" ")} failed (exit ${result.exitCode})`,
            "Check that the Eve CLI can run here (try `npx eve@latest init` manually).",
          );
        }
        diagnostics.push(
          `[info] eve init reported errors during dependency install; Forge will retry the install.`,
        );
        return { detail: "project created (deps pending)" };
      }
      return { detail: `eve ${initMode.args.join(" ")}` };
    });

    await step("install_deps", async () => {
      // `eve init` installs automatically; only run a fallback install if eve is missing.
      if (existsSync(join(projectRoot, "node_modules", "eve"))) {
        return { status: "skipped", detail: "Installed by eve init" };
      }
      const pm = detectPackageManager(projectRoot);
      log(`Installing dependencies with ${pm}…`);
      let { exitCode } = await runCommand(pm, ["install"], projectRoot, log);
      let used = pm;
      // Fall back to npm if the preferred manager fails (commonly an old global
      // pnpm choking on Eve's settings-only pnpm-workspace.yaml). npm ignores
      // that file and still installs the eve runtime into node_modules.
      if (exitCode !== 0 && pm !== "npm") {
        log(`${pm} install failed (exit ${exitCode}); retrying with npm…`);
        ({ exitCode } = await runCommand("npm", ["install"], projectRoot, log));
        used = "npm";
      }
      if (exitCode !== 0) {
        diagnostics.push(`[info] dependency install failed (exit ${exitCode}). Run it manually before forge dev.`);
        return { status: "skipped", detail: `${used} install failed` };
      }
      return { detail: `${used} install` };
    });

    await step("plan", async () => {
      const planned = await createPlanFromNL(session.prompt);
      plan = planned.plan;
      planSource = planned.source;
      session.planSource = planned.source;
      onEvent({ type: "plan", planSource: planned.source, name: plan.name, plan });
      return { detail: `${plan.name} (${planned.source})` };
    });

    await step("apply_content", async () => {
      if (!plan) throw new StepFailure("No plan available");
      const applied = await applyPlanContent(projectRoot, plan);
      newFiles.push(...applied.newFiles);
      return { detail: `${applied.newFiles.length} files` };
    });

    await step("channels", async () => {
      if (!plan) throw new StepFailure("No plan available");
      const kinds = planChannelKinds(plan);
      if (kinds.length === 0) return { status: "skipped", detail: "No CLI channels in plan" };
      const added: string[] = [];
      const failed: string[] = [];
      for (const kind of kinds) {
        log(`Adding ${kind} channel via eve…`);
        const result = await addChannelViaEveCli(projectRoot, kind);
        if (result.ok) added.push(kind);
        else {
          failed.push(kind);
          log(`  ${kind} channel not added: ${(result.stderr || result.stdout).trim().split("\n")[0]}`);
        }
      }
      if (failed.length) {
        diagnostics.push(
          `[info] Channel(s) ${failed.join(", ")} need manual setup — see CONNECTIONS.md (e.g. \`eve channels add ${failed[0]}\`).`,
        );
      }
      const detail = [added.length ? `added ${added.join(", ")}` : null, failed.length ? `manual: ${failed.join(", ")}` : null]
        .filter(Boolean)
        .join("; ");
      // Non-fatal even if all failed.
      return { detail: detail || "none" };
    });

    await step("validate", async () => {
      const manifest = await fetchEveInfo(projectRoot);
      channels = [...new Set(manifest.channels.map((c) => c.id))];
      diagnostics = [
        ...diagnostics,
        ...manifest.diagnostics.map((d) => `[${d.severity}] ${d.message}`),
      ];
      const errors = diagnostics.filter((d) => d.startsWith("[error]"));
      return { detail: errors.length ? `${errors.length} error(s)` : "clean" };
    });

    await step("repair", async () => {
      const errors = diagnostics.filter((d) => d.startsWith("[error]"));
      const model = getPlannerModel();
      if (errors.length === 0 || options.noRepair || !model || !plan) {
        return { status: "skipped", detail: errors.length ? "skipped (no API key)" : "no errors" };
      }
      try {
        const revised = await generatePlanObject(
          model,
          `Fix this Eve agent plan. Previous diagnostics:\n${errors.join("\n")}\n\nOriginal request: ${session.prompt}`,
        );
        const applied = await applyPlanContent(projectRoot, revised);
        newFiles.push(...applied.newFiles.filter((f) => !newFiles.includes(f)));
        plan = revised;
        planSource = "llm";
        session.planSource = "llm";
        const manifest = await fetchEveInfo(projectRoot);
        channels = [...new Set(manifest.channels.map((c) => c.id))];
        diagnostics = manifest.diagnostics.map((d) => `[${d.severity}] ${d.message}`);
        return { detail: "revised plan applied" };
      } catch (error) {
        // Keep the first result (R9).
        return { status: "skipped", detail: `repair skipped: ${error instanceof Error ? error.message : String(error)}` };
      }
    });

    await step("finalize", async () => {
      setLastForgeProject(projectRoot);
      const result: ScaffoldSessionResult = {
        projectRoot,
        name: plan?.name,
        planSource,
        diagnostics,
        newFiles,
        channels,
      };
      session.result = result;
      session.status = "complete";
      session.completedAt = new Date().toISOString();
      await persist();
      onEvent({ type: "complete", result });
      return { detail: plan?.name };
    });
  } catch {
    // Step already recorded the failure + emitted error; persist final state.
    session.status = "failed";
    session.completedAt = new Date().toISOString();
    await persist();
  }

  return session;
}

/** Convenience wrapper used by the CLI / e2e: create a session and run the pipeline. */
export async function scaffoldToDir(
  prompt: string,
  outputDir: string,
  onEvent?: ScaffoldEventHandler,
  options?: RunScaffoldOptions,
): Promise<ScaffoldSession> {
  const session = createScaffoldSession({ prompt, outputDir });
  return runScaffoldPipeline(session, onEvent, options);
}
