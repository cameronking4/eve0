import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractJson, runEve } from "../eve-cli.js";
import {
  resolveActiveDevServerOrigin,
  type ResolveDevServerOriginOptions,
} from "../preview-hosts.js";

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
    const { stdout, stderr, exitCode } = await runEve({
      cwd: projectRoot,
      args: ["eval", "--list"],
      maxBuffer: 10 * 1024 * 1024,
    });
    if (exitCode !== 0) throw new Error(stderr || `eve eval --list exited ${exitCode}`);
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

function normalizeEvalReport(parsed: Record<string, unknown>): EvalRunReport {
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
  };
}

function adaptEvalReportPayload(parsed: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(parsed.results)) return parsed;
  if (!Array.isArray(parsed.evals)) return parsed;

  const results = (parsed.evals as Record<string, unknown>[]).map((entry) => ({
    id: entry.id,
    verdict: entry.verdict,
    error: entry.error,
    assertions: entry.assertions,
    result: {
      status: entry.status,
      assertions: entry.assertions,
    },
  }));

  return { ...parsed, results };
}

async function listEvalRunDirs(projectRoot: string): Promise<string[]> {
  const evalsRoot = join(projectRoot, ".eve/evals");
  try {
    const entries = await readdir(evalsRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

async function readEvalSummary(
  projectRoot: string,
  runDir?: string,
): Promise<Record<string, unknown> | null> {
  const evalsRoot = join(projectRoot, ".eve/evals");
  const candidates = runDir ? [runDir] : (await listEvalRunDirs(projectRoot)).reverse();

  for (const run of candidates) {
    try {
      const raw = await readFile(join(evalsRoot, run, "summary.json"), "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // try next run dir
    }
  }

  return null;
}

function parseEvalReport(combined: string): Record<string, unknown> | null {
  const jsonText = extractJson(combined);
  if (!jsonText.startsWith("{")) return null;
  try {
    return adaptEvalReportPayload(JSON.parse(jsonText) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function runProjectEvals(
  projectRoot: string,
  ids?: string[],
  options?: ResolveDevServerOriginOptions,
): Promise<EvalRunReport> {
  const targetUrl = await resolveActiveDevServerOrigin(projectRoot, options);
  const args = [
    "eval",
    "--json",
    ...(targetUrl ? ["--url", targetUrl] : []),
    ...(ids?.length ? ids : []),
  ];
  const beforeRuns = await listEvalRunDirs(projectRoot);
  const { stdout, stderr, exitCode } = await runEve({
    cwd: projectRoot,
    args,
    maxBuffer: 50 * 1024 * 1024,
    timeoutMs: 300_000,
  });

  const afterRuns = await listEvalRunDirs(projectRoot);
  const newRun = afterRuns.find((run) => !beforeRuns.includes(run)) ?? afterRuns.at(-1);

  // Eve's stdout JSON can truncate when the process exits before the pipe drains.
  // Prefer the artifact summary written before stdout is logged.
  let parsed = newRun ? await readEvalSummary(projectRoot, newRun) : null;
  if (!parsed) {
    parsed = await readEvalSummary(projectRoot);
  }
  if (!parsed) {
    const combined = `${stdout}${stderr ? `\n${stderr}` : ""}`;
    parsed = parseEvalReport(combined);
  } else {
    parsed = adaptEvalReportPayload(parsed);
  }

  if (parsed) {
    return normalizeEvalReport(parsed);
  }
  if (exitCode !== 0) {
    throw new Error(stderr || stdout || `eve eval exited ${exitCode}`);
  }
  throw new Error("eve eval produced no JSON report");
}

export async function readEvalFile(projectRoot: string, relPath: string): Promise<string> {
  return readFile(join(projectRoot, relPath), "utf-8");
}
