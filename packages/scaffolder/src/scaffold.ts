import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createScaffoldSession } from "@forge/core";
import { offlinePlanFromPrompt } from "./examples.js";
import { runScaffoldPipeline, type RunScaffoldOptions, type ScaffoldEventHandler } from "./pipeline.js";
import type { ScaffoldPlan } from "./plan.js";

export interface ScaffoldResult {
  projectRoot: string;
  plan: ScaffoldPlan;
  planSource: "example" | "offline" | "llm";
  depsInstalled: boolean;
  diagnostics: string[];
}

export interface ScaffoldProjectOptions extends RunScaffoldOptions {
  onEvent?: ScaffoldEventHandler;
}

/**
 * Rebased on `eve init` (P1). Creates the project shell with Eve, then layers
 * Forge content on top via {@link runScaffoldPipeline}. Returns a back-compat
 * {@link ScaffoldResult} so existing callers (CLI, e2e) keep working.
 */
export async function scaffoldProject(
  prompt: string,
  targetDir: string,
  options: ScaffoldProjectOptions = {},
): Promise<ScaffoldResult> {
  const projectRoot = resolve(targetDir);
  const session = createScaffoldSession({ prompt, outputDir: projectRoot });

  let plan: ScaffoldPlan | undefined;
  const onEvent: ScaffoldEventHandler = (event) => {
    if (event.type === "plan") plan = event.plan;
    options.onEvent?.(event);
  };

  const finished = await runScaffoldPipeline(session, onEvent, options);

  const diagnostics = finished.result?.diagnostics ?? (finished.error ? [`[error] ${finished.error}`] : []);
  const depsInstalled = existsSync(join(projectRoot, "node_modules", "eve"));

  return {
    projectRoot,
    plan: plan ?? offlinePlanFromPrompt(prompt),
    planSource: finished.planSource ?? "offline",
    depsInstalled,
    diagnostics,
  };
}

/**
 * Backwards-compatible entry point. The LLM repair pass now lives inside the
 * pipeline, so this simply runs the full pipeline (which validates + repairs).
 */
export async function scaffoldWithValidation(
  prompt: string,
  targetDir: string,
  options: ScaffoldProjectOptions = {},
): Promise<ScaffoldResult> {
  return scaffoldProject(prompt, targetDir, options);
}
