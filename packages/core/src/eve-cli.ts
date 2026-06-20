import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The Eve version Forge has been tested against. `forge init` / scaffold
 * bootstrap (before a project-local install exists) use `npx eve@<this>`.
 * Override with `FORGE_EVE_VERSION` to dogfood a newer Eve.
 */
export const FORGE_EVE_VERSION = process.env.FORGE_EVE_VERSION ?? "0.11.4";

export interface RunEveOptions {
  cwd: string;
  args: string[];
  timeoutMs?: number;
  maxBuffer?: number;
  env?: NodeJS.ProcessEnv;
  /** Inherit stdio for interactive commands (link, channels add without -y). */
  inherit?: boolean;
  /** Stream combined stdout/stderr lines (e.g. for the scaffold wizard log). */
  onLine?: (line: string) => void;
  /** Override binary resolution (forces npx bootstrap when true). */
  forceNpx?: boolean;
}

export interface RunEveResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface EveInvocation {
  cmd: string;
  prefix: string[];
  /** How the binary was resolved — useful for diagnostics. */
  source: "project" | "forge" | "npx";
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BUFFER = 50 * 1024 * 1024;

export class EveCliError extends Error {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  hint?: string;

  constructor(args: {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    hint?: string;
  }) {
    const base = `eve ${args.command} failed (exit ${args.exitCode})`;
    super(args.hint ? `${base}\n${args.hint}` : base);
    this.name = "EveCliError";
    this.command = args.command;
    this.exitCode = args.exitCode;
    this.stdout = args.stdout;
    this.stderr = args.stderr;
    this.hint = args.hint;
  }
}

function resolveEvePackageBin(fromDir: string): string | undefined {
  // Resolve the eve package's own bin/eve.js so we can run it with `node`,
  // which is more reliable cross-platform than the `.bin/eve` shim.
  try {
    const require = createRequire(join(fromDir, "noop.js"));
    const pkgPath = require.resolve("eve/package.json");
    const bin = join(pkgPath, "..", "bin", "eve.js");
    return existsSync(bin) ? bin : undefined;
  } catch {
    return undefined;
  }
}

function forgeRepoEveBin(): string | undefined {
  try {
    const require = createRequire(fileURLToPath(import.meta.url));
    const pkgPath = require.resolve("eve/package.json");
    const bin = join(pkgPath, "..", "bin", "eve.js");
    return existsSync(bin) ? bin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolution order (P12 / R12: never resolve the wrong eve):
 *   1. project-local node_modules (preferred)
 *   2. Forge repo node_modules (dev)
 *   3. npx eve@<pinned> (bootstrap, before install)
 */
export function resolveEveInvocation(cwd: string, forceNpx = false): EveInvocation {
  if (!forceNpx) {
    const projectBin = resolveEvePackageBin(cwd);
    if (projectBin) {
      return { cmd: process.execPath, prefix: [projectBin], source: "project" };
    }
    const forgeBin = forgeRepoEveBin();
    if (forgeBin) {
      return { cmd: process.execPath, prefix: [forgeBin], source: "forge" };
    }
  }
  return { cmd: "npx", prefix: ["-y", `eve@${FORGE_EVE_VERSION}`], source: "npx" };
}

function hintForFailure(args: string[], stderr: string, combined: string): string | undefined {
  const text = `${stderr}\n${combined}`.toLowerCase();
  if (text.includes("enoent") || text.includes("command not found")) {
    return "Eve binary not found. Run your package manager's install in the agent project (e.g. `pnpm install`).";
  }
  if (text.includes("not an eve") || text.includes("no eve project") || text.includes("could not find")) {
    return "Not an Eve project here. Run `forge init` or cd to the agent root.";
  }
  if (args[0] === "channels" && (text.includes("interactive") || text.includes("requires an explicit channel"))) {
    return "Interactive channel setup needed. Run `eve channels add <kind>` in a terminal.";
  }
  if (args[0] === "eval" && text.includes("dev server is already running")) {
    return "A preview dev server is already running. Forge should target it automatically — restart Studio if this persists.";
  }
  if (args[0] === "link" && (text.includes("auth") || text.includes("login") || text.includes("tty"))) {
    return "Run `forge link` in a terminal with a TTY to complete Vercel auth.";
  }
  return undefined;
}

/** Run an Eve CLI command. Resolves with stdout/stderr/exitCode (never throws on non-zero). */
export function runEve(opts: RunEveOptions): Promise<RunEveResult> {
  const { cmd, prefix } = resolveEveInvocation(opts.cwd, opts.forceNpx);
  const fullArgs = [...prefix, ...opts.args];

  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, fullArgs, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });

    if (opts.inherit) {
      const timer = opts.timeoutMs
        ? setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs)
        : undefined;
      child.on("error", (error) => {
        if (timer) clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code) => {
        if (timer) clearTimeout(timer);
        resolvePromise({ stdout: "", stderr: "", exitCode: code ?? 0 });
      });
      return;
    }

    const maxBuffer = opts.maxBuffer ?? DEFAULT_MAX_BUFFER;
    let stdout = "";
    let stderr = "";
    let lineBuf = "";
    let overflow = false;

    const emitLines = (chunk: string) => {
      if (!opts.onLine) return;
      lineBuf += chunk;
      let idx: number;
      while ((idx = lineBuf.indexOf("\n")) >= 0) {
        opts.onLine(lineBuf.slice(0, idx));
        lineBuf = lineBuf.slice(idx + 1);
      }
    };

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout?.on("data", (buf: Buffer) => {
      const text = buf.toString("utf8");
      if (stdout.length < maxBuffer) stdout += text;
      else overflow = true;
      emitLines(text);
    });
    child.stderr?.on("data", (buf: Buffer) => {
      const text = buf.toString("utf8");
      if (stderr.length < maxBuffer) stderr += text;
      else overflow = true;
      emitLines(text);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    let exitCode: number | null = null;
    let stdoutEnded = !child.stdout;
    let stderrEnded = !child.stderr;

    const finish = () => {
      if (exitCode === null || !stdoutEnded || !stderrEnded) return;
      clearTimeout(timeout);
      if (lineBuf && opts.onLine) opts.onLine(lineBuf);
      if (overflow) {
        stderr += "\n[forge] output truncated (maxBuffer exceeded)";
      }
      resolvePromise({ stdout, stderr, exitCode });
    };

    child.stdout?.on("end", () => {
      stdoutEnded = true;
      finish();
    });
    child.stderr?.on("end", () => {
      stderrEnded = true;
      finish();
    });
    child.on("exit", (code) => {
      exitCode = code ?? 0;
      finish();
    });
  });
}

/** Run an Eve CLI command, throwing an {@link EveCliError} with a hint on non-zero exit. */
export async function runEveOrThrow(opts: RunEveOptions): Promise<RunEveResult> {
  let result: RunEveResult;
  try {
    result = await runEve(opts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new EveCliError({
      command: opts.args.join(" "),
      exitCode: -1,
      stdout: "",
      stderr: message,
      hint: hintForFailure(opts.args, message, message),
    });
  }
  if (result.exitCode !== 0) {
    throw new EveCliError({
      command: opts.args.join(" "),
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      hint: hintForFailure(opts.args, result.stderr, `${result.stdout}\n${result.stderr}`),
    });
  }
  return result;
}

/** Extract the first complete JSON object/array from CLI output (Eve prints a banner first). */
export function extractJson(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return stdout;

  const firstObj = trimmed.indexOf("{");
  const firstArr = trimmed.indexOf("[");
  const candidates = [firstObj, firstArr].filter((i) => i >= 0);
  if (candidates.length === 0) return trimmed;

  const start = Math.min(...candidates);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }

  return trimmed.slice(start);
}

/** Run `eve <args> --json` and parse the result (banner-tolerant). */
export async function runEveJson<T>(cwd: string, args: string[]): Promise<T> {
  const withJson = args.includes("--json") ? args : [...args, "--json"];
  const result = await runEveOrThrow({ cwd, args: withJson });
  const json = extractJson(result.stdout);
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new EveCliError({
      command: withJson.join(" "),
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      hint: `Could not parse eve JSON output: ${message}`,
    });
  }
}
