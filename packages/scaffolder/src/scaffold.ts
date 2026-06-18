import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fetchEveInfo } from "@forge/core";
import {
  generateAgentTs,
  generateConnectionsMd,
  generateEnvExample,
  generateEveChannel,
  generateEvalsConfig,
  generateGitignore,
  generatePackageJson,
  generateSkillFile,
  generateSmokeEval,
  generateToolFile,
  generateTsConfig,
} from "./codegen.js";
import { createPlanFromNL } from "./llm.js";
import type { ScaffoldPlan } from "./plan.js";

const execFileAsync = promisify(execFile);

async function installProjectDeps(
  projectRoot: string,
): Promise<{ installed: boolean; skipped: boolean; error?: string }> {
  if (existsSync(join(projectRoot, "node_modules", "eve"))) {
    return { installed: true, skipped: true };
  }

  try {
    await execFileAsync("pnpm", ["install"], {
      cwd: projectRoot,
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
    });
    return { installed: true, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { installed: false, skipped: false, error: message };
  }
}

async function collectDiagnostics(projectRoot: string): Promise<string[]> {
  const manifest = await fetchEveInfo(projectRoot);
  return manifest.diagnostics.map((d) => `[${d.severity}] ${d.message}`);
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf-8");
}

export async function writePlanToDisk(
  projectRoot: string,
  plan: ScaffoldPlan,
): Promise<void> {
  await write(join(projectRoot, "package.json"), generatePackageJson(plan.name));
  await write(join(projectRoot, "tsconfig.json"), generateTsConfig());
  await write(join(projectRoot, ".gitignore"), generateGitignore());
  await write(join(projectRoot, "agent/agent.ts"), generateAgentTs(plan.model));
  await write(join(projectRoot, "agent/instructions.md"), plan.instructions.trim() + "\n");
  await write(join(projectRoot, "agent/channels/eve.ts"), generateEveChannel());

  for (const tool of plan.tools) {
    await write(
      join(projectRoot, `agent/tools/${tool.name}.ts`),
      generateToolFile(tool),
    );
  }

  for (const skill of plan.skills) {
    await write(
      join(projectRoot, `agent/skills/${skill.slug}.md`),
      generateSkillFile(skill),
    );
  }

  await write(join(projectRoot, "evals/evals.config.ts"), generateEvalsConfig());
  await write(join(projectRoot, "evals/smoke.eval.ts"), generateSmokeEval(plan));
  await write(join(projectRoot, ".env.example"), generateEnvExample(plan.envVars));
  await write(join(projectRoot, "CONNECTIONS.md"), generateConnectionsMd(plan));
}

export interface ScaffoldResult {
  projectRoot: string;
  plan: ScaffoldPlan;
  planSource: "example" | "offline" | "llm";
  depsInstalled: boolean;
  diagnostics: string[];
}

export async function scaffoldProject(
  prompt: string,
  targetDir: string,
): Promise<ScaffoldResult> {
  const { plan, source } = await createPlanFromNL(prompt);
  await writePlanToDisk(targetDir, plan);

  const needsInstall = !existsSync(join(targetDir, "node_modules", "eve"));
  if (needsInstall) {
    process.stdout.write("Installing dependencies...\n");
  }
  const install = await installProjectDeps(targetDir);
  let diagnostics: string[] = [];

  if (install.installed) {
    try {
      diagnostics = await collectDiagnostics(targetDir);
    } catch (e) {
      diagnostics = [e instanceof Error ? e.message : String(e)];
    }
  } else {
    diagnostics = [
      `[info] Run \`pnpm install\` in the project before \`forge dev\`. (${install.error ?? "install failed"})`,
    ];
  }

  return {
    projectRoot: targetDir,
    plan,
    planSource: source,
    depsInstalled: install.installed,
    diagnostics,
  };
}

export async function scaffoldWithValidation(
  prompt: string,
  targetDir: string,
): Promise<ScaffoldResult> {
  const result = await scaffoldProject(prompt, targetDir);
  const errors = result.diagnostics.filter((d) => d.startsWith("[error]"));
  if (errors.length === 0) return result;

  if (process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY) {
    try {
      const { generateObject } = await import("ai");
      const { openai } = await import("@ai-sdk/openai");
      const { scaffoldPlanSchema } = await import("./plan.js");
      const { object } = await generateObject({
        model: openai("gpt-4o"),
        schema: scaffoldPlanSchema,
        prompt: `Fix this Eve agent plan. Previous diagnostics:\n${errors.join("\n")}\n\nOriginal request: ${prompt}`,
      });
      const plan = scaffoldPlanSchema.parse(object);
      await writePlanToDisk(targetDir, plan);
      result.diagnostics = await collectDiagnostics(targetDir);
      result.plan = plan;
      result.planSource = "llm";
    } catch {
      // keep first result
    }
  }

  return result;
}
