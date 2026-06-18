#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import {
  addRecentWorkspace,
  discoverEveAgentsCached,
  exportProject,
  loadProjectEnv,
  openForgeProject,
  refreshManifest,
  resolveForgeProjectRoot,
  setLastForgeAgent,
  setLastForgeProject,
  stopPreviewHostProcesses,
  stopStaleEveDev,
  warmPreviewHosts,
} from "@forge/core";
import { scaffoldWithValidation } from "@forge/scaffolder";
import { Command } from "commander";
import open from "open";

for (const envFile of [".env.local", ".env"]) {
  const path = join(process.cwd(), envFile);
  if (existsSync(path)) {
    loadEnvFile(path);
    break;
  }
}

const program = new Command();

program.name("forge").description("Forge — visual editor and scaffolder for Eve agents").version("0.1.0");

program
  .command("init")
  .argument("[name]", "Project name")
  .description("Scaffold a new Eve project via eve init")
  .action(async (name?: string) => {
    const target = name ?? "my-agent";
    await run("npx", ["eve@latest", "init", target], process.cwd());
    console.log(`\n✓ Eve project created at ${target}`);
    console.log(`  Run: cd ${target} && forge dev`);
  });

program
  .command("scaffold")
  .argument("<prompt>", "Natural language agent description")
  .option("-o, --output <dir>", "Output directory", "scaffolded-agent")
  .description("NL-generate a complete agent/ tree")
  .action(async (prompt: string, opts: { output: string }) => {
    const dir = resolve(opts.output);
    await mkdir(dir, { recursive: true });
    console.log(`Scaffolding agent in ${dir}...`);
    const result = await scaffoldWithValidation(prompt, dir);
    setLastForgeProject(dir);
    if (result.planSource === "offline") {
      console.log(
        "\nℹ Offline template (no API key). Set OPENAI_API_KEY or AI_GATEWAY_API_KEY in .env.local for full NL generation.",
      );
    }
    console.log(`\n✓ Generated "${result.plan.name}"`);
    console.log(`  Tools: ${result.plan.tools.map((t: { name: string }) => t.name).join(", ")}`);
    console.log(`  Skills: ${result.plan.skills.map((s: { slug: string }) => s.slug).join(", ")}`);
    if (result.diagnostics.length) {
      const actionable = result.diagnostics.filter((d) => !d.startsWith("[info]"));
      if (actionable.length) {
        console.log("\nDiagnostics:");
        actionable.forEach((d) => console.log(`  ${d}`));
      }
    }
    console.log(`\n  Next: forge dev`);
  });

program
  .command("agents")
  .option("-p, --project <path>", "Workspace or agent root (auto-detected when omitted)")
  .option("--workspace", "Treat path as monorepo workspace even when cwd is a single agent")
  .option("--json", "Output JSON")
  .description("List Eve agents discovered in a workspace")
  .action(async (opts: { project?: string; workspace?: boolean; json?: boolean }) => {
    const resolved = resolveForgeProjectRoot({
      path: opts.project,
      workspace: opts.workspace,
    });
    const workspaceRoot = resolved.workspaceRoot ?? resolved.root;
    const agents = discoverEveAgentsCached(workspaceRoot);

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            workspaceRoot,
            activeRoot: resolved.root,
            agents,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`Workspace: ${workspaceRoot}`);
    console.log(`Active:    ${resolved.root}`);
    console.log(`Agents (${agents.length}):`);
    for (const agent of agents) {
      const active = agent.root === resolved.root ? " *" : "";
      console.log(`  ${agent.name}${active}`);
      console.log(`    ${agent.root}`);
      if (agent.relativePath !== ".") {
        console.log(`    (${agent.relativePath})`);
      }
    }
  });

program
  .command("dev")
  .option("-p, --project <path>", "Eve project or workspace root (auto-detected when omitted)")
  .option("--agent <name>", "Pre-select agent by name, folder, or relative path")
  .option("--workspace", "Prefer monorepo workspace mode from cwd")
  .option("--port <port>", "Studio port", "4000")
  .option("--no-open", "Do not open browser")
  .option("--preview", "Open agent preview instead of editor")
  .option("--no-warm-preview", "Skip eager Eve preview pool startup")
  .description("Start Forge studio with integrated Eve preview (via withEve)")
  .action(
    async (opts: {
      project?: string;
      agent?: string;
      workspace?: boolean;
      port: string;
      open: boolean;
      preview?: boolean;
      warmPreview?: boolean;
    }) => {
      const { root: projectRoot, workspaceRoot, source } = resolveForgeProjectRoot({
        path: opts.project,
        agent: opts.agent,
        workspace: opts.workspace,
      });

      const recordRoot = workspaceRoot ?? projectRoot;
      setLastForgeProject(recordRoot);
      addRecentWorkspace(recordRoot);
      if (workspaceRoot) {
        setLastForgeAgent(workspaceRoot, projectRoot);
      }

      if (!opts.project) {
        const label =
          source === "last"
            ? "last project"
            : source === "cwd"
              ? "current directory"
              : "project";
        console.log(`Using ${label}: ${recordRoot}`);
      }

      const agents = workspaceRoot ? discoverEveAgentsCached(workspaceRoot) : [];
      if (workspaceRoot) {
        console.log(`Workspace mode: ${agents.length} agent(s) detected`);
      }

      const projectName =
        agents.find((a) => a.root === projectRoot)?.name ??
        projectRoot.split("/").pop() ??
        "agent";

      loadProjectEnv(projectRoot);
      await stopStaleEveDev(projectRoot);

      let previewHostsEnv: string | undefined;
      if (workspaceRoot && agents.length > 0 && opts.warmPreview !== false) {
        console.log("Warming Eve preview pool…");
        const manifest = await warmPreviewHosts(workspaceRoot, agents, projectRoot);
        previewHostsEnv = JSON.stringify(manifest);
        const warmed = Object.values(manifest.hosts).filter((host) => host.length > 0).length;
        console.log(`  Preview hosts ready (${warmed} dedicated + 1 via withEve)`);
      }

      process.env.FORGE_PROJECT_ROOT = projectRoot;
      process.env.FORGE_AGENT_NAME = projectName;
      if (workspaceRoot) {
        process.env.FORGE_WORKSPACE_ROOT = workspaceRoot;
      } else {
        delete process.env.FORGE_WORKSPACE_ROOT;
      }
      if (previewHostsEnv) {
        process.env.FORGE_PREVIEW_HOSTS = previewHostsEnv;
      } else {
        delete process.env.FORGE_PREVIEW_HOSTS;
      }

      const studioRoot = resolve(
        join(fileURLToPath(new URL(".", import.meta.url)), "../../../apps/studio"),
      );

      const studio = spawn("pnpm", ["exec", "next", "dev", "-p", opts.port], {
        cwd: studioRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          FORGE_PROJECT_ROOT: projectRoot,
          FORGE_AGENT_NAME: projectName,
          ...(workspaceRoot ? { FORGE_WORKSPACE_ROOT: workspaceRoot } : {}),
          ...(previewHostsEnv ? { FORGE_PREVIEW_HOSTS: previewHostsEnv } : {}),
        },
      });

      const baseUrl = `http://localhost:${opts.port}`;
      const url = opts.preview ? `${baseUrl}/preview` : baseUrl;
      console.log(`\n🔨 Forge studio: ${baseUrl}`);
      console.log(`   Preview:    ${baseUrl}/preview`);
      console.log(`   Agent:      ${projectName}`);
      console.log(`   Project:    ${projectRoot}`);
      if (workspaceRoot) {
        console.log(`   Workspace:  ${workspaceRoot}`);
      }
      console.log(`   Eve agent:  started via withEve() from project root\n`);

      if (opts.open) {
        setTimeout(() => open(url), 2500);
      }

      const shutdown = () => {
        stopPreviewHostProcesses();
        studio.kill();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      await new Promise<void>((resolvePromise) => {
        studio.on("exit", () => resolvePromise());
      });
    },
  );

program
  .command("export")
  .argument("[path]", "Export destination", "./forge-export")
  .option("-p, --project <path>", "Eve project root (auto-detected when omitted)")
  .option("--agent <name>", "Agent to export when using a workspace")
  .description("Export clean agent/ + docs")
  .action(async (exportPath: string, opts: { project?: string; agent?: string }) => {
    const { root } = resolveForgeProjectRoot({ path: opts.project, agent: opts.agent });
    const project = await openForgeProject(root);
    const result = await exportProject(project, resolve(exportPath));
    console.log(`✓ Exported to ${result.outputPath}`);
    console.log(`  ${result.files.length} files written`);
  });

program
  .command("info")
  .option("-p, --project <path>", "Eve project root (auto-detected when omitted)")
  .option("--agent <name>", "Agent to inspect when using a workspace")
  .option("--json", "Output JSON")
  .description("Print Eve discovery manifest")
  .action(async (opts: { project?: string; agent?: string; json?: boolean }) => {
    const { root } = resolveForgeProjectRoot({ path: opts.project, agent: opts.agent });
    const project = await refreshManifest(await openForgeProject(root));
    if (opts.json) {
      console.log(JSON.stringify(project.manifest, null, 2));
      return;
    }
    const m = project.manifest;
    console.log(`Agent: ${m.name ?? "unnamed"}`);
    console.log(`Model: ${m.model ?? "unknown"}`);
    console.log(`Tools (${m.tools.length}): ${m.tools.map((t) => t.name).join(", ")}`);
    console.log(`Skills (${m.skills.length}): ${m.skills.map((s) => s.id).join(", ")}`);
    console.log(`Channels (${m.channels.length}): ${m.channels.map((c) => c.id).join(", ")}`);
    console.log(`Schedules (${m.schedules.length}): ${m.schedules.map((s) => s.id).join(", ")}`);
    if (m.diagnostics.length) {
      console.log("\nDiagnostics:");
      m.diagnostics.forEach((d) => console.log(`  [${d.severity}] ${d.message}`));
    }
  });

program.parse();

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: true });
    child.on("exit", (code) => (code === 0 ? resolvePromise() : reject(new Error(`${cmd} exited ${code}`))));
  });
}
