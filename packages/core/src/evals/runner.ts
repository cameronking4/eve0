import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface EvalInfo {
  id: string;
  description: string;
  sourcePath?: string;
}

export interface EvalAssertionResult {
  name?: string;
  passed?: boolean;
  message?: string;
}

export interface EvalRunResult {
  id: string;
  passed: boolean;
  result?: {
    status?: string;
    output?: string;
    finalMessage?: string;
    sessionId?: string;
    assertions?: EvalAssertionResult[];
    error?: string;
  };
  error?: string;
}

export interface EvalRunReport {
  target?: { kind?: string; url?: string };
  results: EvalRunResult[];
  passed: boolean;
  rawStdout?: string;
}

function parseListLine(line: string): EvalInfo | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const sep = trimmed.includes(" — ") ? " — " : trimmed.includes(" - ") ? " - " : null;
  if (!sep) return { id: trimmed, description: trimmed };
  const [id, ...rest] = trimmed.split(sep);
  return { id: id.trim(), description: rest.join(sep).trim() };
}

export async function discoverEvalFiles(projectRoot: string): Promise<string[]> {
  const paths: string[] = [];
  async function walk(rel: string) {
    const entries = await readdir(join(projectRoot, rel), { withFileTypes: true });
    for (const entry of entries) {
      const path = `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".eval.ts") || entry.name.endsWith(".eval.yaml")) {
        paths.push(path);
      }
    }
  }
  try {
    await walk("evals");
  } catch {
    // no evals dir
  }
  return paths;
}

export async function listProjectEvals(projectRoot: string): Promise<EvalInfo[]> {
  try {
    const { stdout } = await execFileAsync("npx", ["eve", "eval", "--list"], {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    });
    const listed = stdout
      .split("\n")
      .map(parseListLine)
      .filter((e): e is EvalInfo => e !== null);

    const files = await discoverEvalFiles(projectRoot);
    const byId = new Map(listed.map((e) => [e.id, e]));
    for (const file of files) {
      const id = file.replace(/^evals\//, "").replace(/\.eval\.(ts|yaml)$/, "").replace(/\//g, "-");
      const base = file.split("/").pop()?.replace(/\.eval\.(ts|yaml)$/, "") ?? id;
      const key = file.includes("/") ? file.replace(/^evals\//, "").replace(/\.eval\.(ts|yaml)$/, "").replace(/\//g, "/") : base;
      const existing = byId.get(key) ?? byId.get(base);
      if (existing) {
        existing.sourcePath = file;
      } else {
        byId.set(key, { id: key, description: key, sourcePath: file });
      }
    }
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    const files = await discoverEvalFiles(projectRoot);
    if (files.length) {
      return files.map((file) => ({
        id: file.replace(/^evals\//, "").replace(/\.eval\.(ts|yaml)$/, ""),
        description: file,
        sourcePath: file,
      }));
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not list evals: ${message}`);
  }
}

function normalizeEvalReport(parsed: Record<string, unknown>, stdout: string): EvalRunReport {
  const resultsRaw = Array.isArray(parsed.results) ? parsed.results : [];
  const results: EvalRunResult[] = resultsRaw.map((entry) => {
    const row = entry as Record<string, unknown>;
    const id = String(row.id ?? "unknown");
    const result = row.result as Record<string, unknown> | undefined;
    const assertions = (
      Array.isArray(row.assertions)
        ? row.assertions
        : Array.isArray(result?.assertions)
          ? result.assertions
          : []
    ) as EvalAssertionResult[];

    const verdict = row.verdict as string | undefined;
    const passed =
      verdict === "passed" ||
      (assertions.length > 0
        ? assertions.every((a) => a.passed !== false)
        : verdict !== "failed" && row.error === undefined);

    return {
      id,
      passed,
      result: {
        status: (result?.status as string | undefined) ?? verdict,
        output: (result?.output as string | undefined) ?? (row.output as string | undefined),
        finalMessage: result?.finalMessage as string | undefined,
        sessionId: result?.sessionId as string | undefined,
        assertions,
        error: (row.error as string | undefined) ?? (result?.error as string | undefined),
      },
      error: row.error ? String(row.error) : undefined,
    };
  });

  const topPassed = typeof parsed.passed === "number" ? parsed.passed : undefined;
  const topFailed = typeof parsed.failed === "number" ? parsed.failed : undefined;
  const passed =
    topFailed !== undefined && topPassed !== undefined
      ? topFailed === 0 && results.every((r) => r.passed)
      : results.length > 0 && results.every((r) => r.passed);

  return {
    target: parsed.target as EvalRunReport["target"],
    results,
    passed,
    rawStdout: stdout,
  };
}

export async function runProjectEvals(
  projectRoot: string,
  ids?: string[],
): Promise<EvalRunReport> {
  const args = ["eve", "eval", "--json", ...(ids?.length ? ids : [])];
  try {
    const { stdout } = await execFileAsync("npx", args, {
      cwd: projectRoot,
      maxBuffer: 50 * 1024 * 1024,
      timeout: 300_000,
      env: process.env,
    });
    const jsonStart = stdout.indexOf("{");
    const jsonText = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
    return normalizeEvalReport(JSON.parse(jsonText) as Record<string, unknown>, stdout);
  } catch (error) {
    const err = error as { stdout?: string; message?: string };
    if (err.stdout) {
      const jsonStart = err.stdout.indexOf("{");
      if (jsonStart >= 0) {
        return normalizeEvalReport(
          JSON.parse(err.stdout.slice(jsonStart)) as Record<string, unknown>,
          err.stdout,
        );
      }
    }
    throw new Error(err.message ?? String(error));
  }
}

export async function readEvalFile(projectRoot: string, relPath: string): Promise<string> {
  return readFile(join(projectRoot, relPath), "utf-8");
}
