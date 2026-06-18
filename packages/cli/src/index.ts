#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import {
  addRecentWorkspace,
  createScaffoldSession,
  discoverEveAgentsCached,
  exportProject,
  getEveAgentState,
  hasModelCredentials,
  loadProjectEnv,
  MODEL_CREDENTIAL_VARS,
  openForgeProject,
  refreshManifest,
  resolveForgeProjectRoot,
  runEve,
  runForgeDoctor,
  setLastForgeAgent,
  setLastForgeProject,
  stopPreviewHostProcesses,
  stopStaleEveDev,
  warmPreviewHosts,
  writeStagedScaffoldSession,
} from "@forge/core";
import { scaffoldToDir } from "@forge/scaffolder";
import { Command } from "commander";
import open from "open";

const CLI_DIR = fileURLToPath(new URL(".", import.meta.url));
// Dev (monorepo, from source): run `next dev` for HMR.
const STUDIO_DEV_ROOT = resolve(CLI_DIR, "../../../apps/studio");
// Published: a self-contained Next standalone server shipped as a tarball
// (scripts/bundle-studio.sh) and extracted on first run. We ship a tarball
// because npm strips symlinks, which pnpm's standalone node_modules relies on.
const STUDIO_TARBALL = resolve(CLI_DIR, "../studio.tar.gz");
const STUDIO_EXTRACT_DIR = resolve(CLI_DIR, "../studio");
const STUDIO_STANDALONE_SERVER = resolve(STUDIO_EXTRACT_DIR, "apps/studio/server.js");

type StudioRuntime =
  | { mode: "standalone"; serverJs: string }
  | { mode: "dev"; root: string };

/** Extract the bundled studio tarball into place if not already extracted. */
function ensureStudioExtracted(): boolean {
  if (existsSync(STUDIO_STANDALONE_SERVER)) return true;
  if (!existsSync(STUDIO_TARBALL)) return false;
  mkdirSync(STUDIO_EXTRACT_DIR, { recursive: true });
  // tar preserves the symlinks that Next's standalone module resolution needs.
  const result = spawnSync("tar", ["-xzf", STUDIO_TARBALL, "-C", STUDIO_EXTRACT_DIR], {
    stdio: "inherit",
  });
  return result.status === 0 && existsSync(STUDIO_STANDALONE_SERVER);
}

/** Prefer the bundled standalone server (npm install); fall back to `next dev`. */
function resolveStudioRuntime(): StudioRuntime {
  const override = process.env.FORGE_STUDIO_DIR;
  if (override) {
    const serverJs = resolve(override, "apps/studio/server.js");
    if (existsSync(serverJs)) return { mode: "standalone", serverJs };
    if (existsSync(resolve(override, "server.js"))) {
      return { mode: "standalone", serverJs: resolve(override, "server.js") };
    }
  }

  // Monorepo dev: use live Studio sources (HMR + latest API routes).
  if (existsSync(join(STUDIO_DEV_ROOT, "package.json")) && !process.env.FORGE_USE_BUNDLED_STUDIO) {
    return { mode: "dev", root: STUDIO_DEV_ROOT };
  }

  if (ensureStudioExtracted()) {
    return { mode: "standalone", serverJs: STUDIO_STANDALONE_SERVER };
  }
  return { mode: "dev", root: STUDIO_DEV_ROOT };
}

/** Spawn Forge Studio (standalone server or Next dev), open the browser, resolve on exit. */
async function launchStudio(opts: {
  port: string;
  open: boolean;
  openPath?: string;
  env?: Record<string, string | undefined>;
  banner?: (baseUrl: string) => void;
}): Promise<void> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(opts.env ?? {})) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }

  const runtime = resolveStudioRuntime();
  let studio: ReturnType<typeof spawn>;
  if (runtime.mode === "standalone") {
    // Next's standalone server reads PORT/HOSTNAME from the environment.
    const serverDir = resolve(runtime.serverJs, "..");
    studio = spawn(process.execPath, [runtime.serverJs], {
      cwd: serverDir,
      stdio: "inherit",
      env: {
        ...env,
        PORT: opts.port,
        HOSTNAME: env.HOSTNAME ?? "127.0.0.1",
        // Explicit — standalone bundles must not fall back to Studio cwd as agent root.
        FORGE_PROJECT_ROOT: env.FORGE_PROJECT_ROOT,
      },
    });
  } else {
    studio = spawn("pnpm", ["exec", "next", "dev", "-p", opts.port], {
      cwd: runtime.root,
      stdio: "inherit",
      env,
    });
  }

  const baseUrl = `http://localhost:${opts.port}`;
  opts.banner?.(baseUrl);

  if (opts.open) {
    const url = `${baseUrl}${opts.openPath ?? ""}`;
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
}

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
  .option("--web", "Add the Next.js Web Chat channel (eve --channel-web-nextjs)")
  .description("Scaffold a new Eve project via eve init")
  .action(async (name: string | undefined, opts: { web?: boolean }) => {
    const target = name ?? "my-agent";
    const args = ["init", target];
    if (opts.web) args.push("--channel-web-nextjs");
    // P7/P12: bootstrap via the pinned Eve before a project-local install exists.
    const result = await runEve({ cwd: process.cwd(), args, inherit: true, forceNpx: true });
    if (result.exitCode !== 0) {
      console.error(`\n✗ eve init failed (exit ${result.exitCode})`);
      process.exitCode = result.exitCode;
      return;
    }
    console.log(`\n✓ Eve project created at ${target}`);
    console.log(`  Run: cd ${target} && forge dev`);
  });

program
  .command("scaffold")
  .argument("<prompt>", "Natural language agent description")
  .option("-o, --output <dir>", "Output directory", "scaffolded-agent")
  .option("--sync", "Run the scaffold pipeline synchronously (no Studio wizard)")
  .option("--force", "Allow scaffolding into a non-empty directory")
  .option("--no-repair", "Skip the LLM repair pass")
  .option("--port <port>", "Studio port", "4000")
  .option("--no-open", "Do not open the browser (wizard mode)")
  .description("Build an Eve project (eve init) and layer Forge agent content on top")
  .action(
    async (
      prompt: string,
      opts: {
        output: string;
        sync?: boolean;
        force?: boolean;
        repair?: boolean;
        port: string;
        open: boolean;
      },
    ) => {
      const dir = resolve(opts.output);

      // Default: launch the Studio wizard and stream progress there (P8: same
      // pipeline as --sync, just driven by the wizard via SSE).
      if (!opts.sync) {
        const session = createScaffoldSession({ prompt, outputDir: dir });
        await writeStagedScaffoldSession(session);
        console.log(`Opening Forge scaffold wizard for ${dir}…`);
        await launchStudio({
          port: opts.port,
          open: opts.open,
          openPath: `/scaffold?session=${session.id}`,
          env: {
            FORGE_SCAFFOLD_SESSION: session.id,
            FORGE_ONBOARDING_CWD: dir,
            // Project doesn't exist yet — clear any inherited root/workspace.
            FORGE_PROJECT_ROOT: undefined,
            FORGE_WORKSPACE_ROOT: undefined,
          },
          banner: (baseUrl) => {
            console.log(`\n🔨 Forge scaffold wizard: ${baseUrl}/scaffold?session=${session.id}\n`);
          },
        });
        return;
      }

      console.log(`Scaffolding agent in ${dir}…\n`);
      if (!hasModelCredentials()) {
        console.log(
          `ℹ No model credentials (${MODEL_CREDENTIAL_VARS.join(", ")}) — ` +
            "open-ended prompts use offline templates only.\n",
        );
      }

      const session = await scaffoldToDir(
        prompt,
        dir,
        (event) => {
          if (event.type === "step") {
            const { status, label, detail } = event.step;
            const icon =
              status === "running"
                ? "▶"
                : status === "done"
                  ? "✓"
                  : status === "skipped"
                    ? "–"
                    : status === "failed"
                      ? "✗"
                      : "•";
            if (status !== "running") {
              console.log(`${icon} ${label}${detail ? `  (${detail})` : ""}`);
            }
          } else if (event.type === "plan") {
            console.log(`  Plan: ${event.name} [${event.planSource}]`);
          } else if (event.type === "error") {
            console.error(`\n✗ ${event.error}`);
          }
        },
        { force: opts.force, noRepair: opts.repair === false },
      );

      if (session.status === "failed") {
        process.exitCode = 1;
        return;
      }

      const result = session.result;
      if (result?.planSource === "offline") {
        console.log(
          "\nℹ Offline template (no API key). Set OPENAI_API_KEY or AI_GATEWAY_API_KEY in .env.local for full NL generation.",
        );
      }
      console.log(`\n✓ Generated "${result?.name ?? "agent"}"`);
      if (result?.channels.length) {
        console.log(`  Channels: ${result.channels.join(", ")}`);
      }
      const actionable = (result?.diagnostics ?? []).filter((d) => !d.startsWith("[info]"));
      if (actionable.length) {
        console.log("\nDiagnostics:");
        actionable.forEach((d) => console.log(`  ${d}`));
      }
      console.log(`\n  Next: cd ${opts.output} && forge dev`);
    },
  );

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
      let resolved: ReturnType<typeof resolveForgeProjectRoot>;
      try {
        resolved = resolveForgeProjectRoot({
          path: opts.project,
          agent: opts.agent,
          workspace: opts.workspace,
        });
      } catch {
        // No Eve agent found → describe-your-agent onboarding (reuses the
        // scaffold pipeline via the Studio wizard).
        const cwd = opts.project ? resolve(opts.project) : process.cwd();
        console.log("No Eve agent found here — starting the describe-your-agent onboarding.\n");
        await launchStudio({
          port: opts.port,
          open: opts.open,
          openPath: "/scaffold",
          env: {
            FORGE_ONBOARDING_CWD: cwd,
            FORGE_PROJECT_ROOT: undefined,
            FORGE_WORKSPACE_ROOT: undefined,
            FORGE_PREVIEW_HOSTS: undefined,
          },
          banner: (baseUrl) => console.log(`\n🔨 Forge onboarding: ${baseUrl}/scaffold\n`),
        });
        return;
      }

      const { root: projectRoot, workspaceRoot, source } = resolved;
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
      if (!hasModelCredentials()) {
        console.warn(
          `\n⚠ No model credentials found for ${projectName}.` +
            `\n  Preview/chat needs one of: ${MODEL_CREDENTIAL_VARS.join(", ")}.` +
            `\n  Add it to ${projectRoot}/.env.local before chatting in the preview.\n`,
        );
      }
      await stopStaleEveDev(projectRoot);

      let previewHostsEnv: string | undefined;
      if (workspaceRoot && agents.length > 0 && opts.warmPreview !== false) {
        console.log("Warming Eve preview pool…");
        try {
          const manifest = await warmPreviewHosts(workspaceRoot, agents, projectRoot);
          previewHostsEnv = JSON.stringify(manifest);
          const warmed = Object.values(manifest.hosts).filter((host) => host.length > 0).length;
          console.log(`  Preview hosts ready (${warmed} dedicated + 1 via withEve)`);
        } catch (error) {
          console.warn(
            `  Preview pool warmup skipped: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // A fresh `eve init` shell (no instructions/tools/skills) → open the
      // onboarding wizard so the user can describe and fill it in place.
      const isBlank = getEveAgentState(projectRoot) === "blank";
      if (isBlank) {
        console.log("This Eve agent is still a blank shell — opening onboarding to describe it.");
      }

      await launchStudio({
        port: opts.port,
        open: opts.open,
        openPath: isBlank ? "/scaffold" : opts.preview ? "/preview" : "",
        env: {
          FORGE_PROJECT_ROOT: projectRoot,
          FORGE_AGENT_NAME: projectName,
          FORGE_ONBOARDING_CWD: projectRoot,
          FORGE_WORKSPACE_ROOT: workspaceRoot ?? undefined,
          FORGE_PREVIEW_HOSTS: previewHostsEnv ?? undefined,
        },
        banner: (baseUrl) => {
          console.log(`\n🔨 Forge studio: ${baseUrl}`);
          console.log(`   Preview:    ${baseUrl}/preview`);
          console.log(`   Agent:      ${projectName}`);
          console.log(`   Project:    ${projectRoot}`);
          if (workspaceRoot) {
            console.log(`   Workspace:  ${workspaceRoot}`);
          }
          console.log(`   Eve agent:  started via withEve() from project root\n`);
        },
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

program
  .command("doctor")
  .option("-p, --project <path>", "Eve project root (auto-detected when omitted)")
  .option("--agent <name>", "Agent to inspect when using a workspace")
  .option("--json", "Output JSON report")
  .description("Non-destructive health check: eve info + alignment vs eve init baseline")
  .action(async (opts: { project?: string; agent?: string; json?: boolean }) => {
    try {
      const { root } = resolveForgeProjectRoot({ path: opts.project, agent: opts.agent });
      const report = await runForgeDoctor(root);

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(`Project: ${report.projectRoot}`);
        console.log(`Agent state: ${report.agentState}`);
        console.log("");
        for (const f of report.findings) {
          const tag =
            f.severity === "ok"
              ? "✓"
              : f.severity === "info"
                ? "ℹ"
                : f.severity === "warning"
                  ? "⚠"
                  : "✗";
          console.log(`${tag} ${f.message}`);
          if (f.hint) console.log(`  → ${f.hint}`);
        }
        console.log("");
        console.log(report.ok ? "✓ No blocking issues." : "✗ Fix errors above before shipping.");
      }

      process.exitCode = report.ok ? 0 : 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ── Phase 3: passthrough commands (forge <cmd> → eve <cmd>) ──────────────────
// Forge resolves the project root (-p / --agent), then forwards everything else
// verbatim to the Eve CLI with an inherited TTY (interactive link/channels/etc).
const PASSTHROUGH: Record<string, string> = {
  eval: "Run evals via `eve eval` (forwards extra args, e.g. --list)",
  build: "Build the agent via `eve build`",
  start: "Start the agent via `eve start`",
  link: "Link the project to Eve Cloud via `eve link`",
  deploy: "Deploy the agent via `eve deploy`",
  channels: "Manage channels via `eve channels` (e.g. add slack)",
};

for (const [name, description] of Object.entries(PASSTHROUGH)) {
  program
    .command(name)
    .description(description)
    .option("-p, --project <path>", "Eve project root (auto-detected when omitted)")
    .option("--agent <name>", "Agent to target when using a workspace")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .helpOption(false)
    .action(() => {
      // Execution is handled by the argv intercept below (so arbitrary Eve
      // flags forward cleanly); this registration is for `forge --help`.
    });
}

async function runPassthrough(cmd: string, argv: string[]): Promise<void> {
  let project: string | undefined;
  let agent: string | undefined;
  const forwarded: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-p" || arg === "--project") {
      project = argv[++i];
    } else if (arg.startsWith("--project=")) {
      project = arg.slice("--project=".length);
    } else if (arg.startsWith("-p=")) {
      project = arg.slice("-p=".length);
    } else if (arg === "--agent") {
      agent = argv[++i];
    } else if (arg.startsWith("--agent=")) {
      agent = arg.slice("--agent=".length);
    } else {
      forwarded.push(arg);
    }
  }

  let root: string;
  try {
    root = resolveForgeProjectRoot({ path: project, agent }).root;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const result = await runEve({ cwd: root, args: [cmd, ...forwarded], inherit: true });
  process.exitCode = result.exitCode;
}

const passthroughCmd = process.argv[2];
if (passthroughCmd && Object.prototype.hasOwnProperty.call(PASSTHROUGH, passthroughCmd)) {
  await runPassthrough(passthroughCmd, process.argv.slice(3));
} else {
  program.parse();
}
