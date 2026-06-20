"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  FolderOpen,
  Loader2,
  MinusCircle,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { ScaffoldSession, ScaffoldStepRecord } from "@forge/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useProject } from "@/context/project-context";

type WizardPhase = "loading" | "describe" | "running" | "review" | "failed";

interface OnboardingState {
  mode: "missing" | "blank" | "ready";
  projectRoot: string | null;
  onboardingCwd: string;
  workspaceRoot: string | null;
  activeSessionId: string | null;
}

function defaultNewAgentBaseDir(state: OnboardingState): string {
  if (state.workspaceRoot) {
    return joinPath(state.workspaceRoot, "agents");
  }
  return state.onboardingCwd;
}

interface ScaffoldResult {
  projectRoot: string;
  name?: string;
  planSource?: string;
  diagnostics: string[];
  newFiles: string[];
  channels: string[];
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "my-agent"
  );
}

function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/$/, "")}/${name}`;
}

const STEP_ICON: Record<ScaffoldStepRecord["status"], React.ReactNode> = {
  pending: <CircleDashed className="size-4 text-muted-foreground" />,
  running: <Loader2 className="size-4 animate-spin text-primary" />,
  done: <CheckCircle2 className="size-4 text-emerald-500" />,
  skipped: <MinusCircle className="size-4 text-muted-foreground" />,
  failed: <XCircle className="size-4 text-destructive" />,
};

export function ScaffoldWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh: refreshProject } = useProject();
  const isNewAgent = params.get("new") === "1";

  const [phase, setPhase] = useState<WizardPhase>("loading");
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(params.get("session"));
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [baseDir, setBaseDir] = useState("");
  const [steps, setSteps] = useState<ScaffoldStepRecord[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [planLabel, setPlanLabel] = useState<string | null>(null);
  const [result, setResult] = useState<ScaffoldResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const startedRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, logOpen]);

  const applyEvent = useCallback((event: Record<string, unknown>) => {
    const type = event.type as string;
    if (type === "step") {
      const step = event.step as ScaffoldStepRecord;
      setSteps((prev) => {
        const idx = prev.findIndex((s) => s.id === step.id);
        if (idx === -1) return [...prev, step];
        const next = [...prev];
        next[idx] = step;
        return next;
      });
    } else if (type === "log") {
      setLogs((prev) => [...prev, String(event.line)]);
    } else if (type === "plan") {
      setPlanLabel(`${event.name} · ${event.planSource}`);
    } else if (type === "complete") {
      setResult(event.result as ScaffoldResult);
    } else if (type === "error") {
      setError(String(event.error));
    }
  }, []);

  const streamRun = useCallback(
    async (id: string, opts: { existing?: boolean; force?: boolean } = {}) => {
      setPhase("running");
      try {
        const res = await fetch("/api/scaffold/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, existing: opts.existing, force: opts.force }),
        });
        if (res.status === 409) {
          // already running/complete elsewhere → poll instead (M-A2)
          await pollResult(id);
          return;
        }
        if (!res.body) throw new Error("No response stream");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            try {
              applyEvent(JSON.parse(line.slice(5).trim()));
            } catch {
              // ignore malformed chunk
            }
          }
        }
        await finalize(id);
      } catch {
        // stream dropped — fall back to polling
        await pollResult(id);
      }
    },
    [applyEvent],
  );

  const pollResult = useCallback(async (id: string) => {
    for (let i = 0; i < 600; i++) {
      const res = await fetch(`/api/scaffold/result?id=${id}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.steps)) setSteps(data.steps);
        if (data.status === "complete") {
          setResult(data.result);
          setPhase("review");
          return;
        }
        if (data.status === "failed") {
          setError(data.error ?? "Scaffold failed");
          setPhase("failed");
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }, []);

  const finalize = useCallback(async (id: string) => {
    const res = await fetch(`/api/scaffold/result?id=${id}`);
    const data = await res.json();
    if (Array.isArray(data.steps)) setSteps(data.steps);
    if (data.status === "complete") {
      setResult(data.result);
      setPhase("review");
    } else {
      setError(data.error ?? "Scaffold failed");
      setPhase("failed");
    }
  }, []);

  // Boot: load onboarding state + any existing session.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const stateRes = await fetch("/api/onboarding/state");
      const state: OnboardingState = await stateRes.json();
      setOnboarding(state);
      setBaseDir(isNewAgent ? defaultNewAgentBaseDir(state) : state.onboardingCwd);

      const id = params.get("session") ?? (isNewAgent ? null : state.activeSessionId);
      if (id) {
        setSessionId(id);
        const sRes = await fetch(`/api/scaffold/session?id=${id}`);
        if (sRes.ok) {
          const { session } = (await sRes.json()) as { session: ScaffoldSession };
          setSteps(session.steps);
          setPrompt(session.prompt);
          if (session.status === "complete" && session.result) {
            setResult(session.result as ScaffoldResult);
            setPhase("review");
            return;
          }
          if (session.status === "failed") {
            setError(session.error ?? "Scaffold failed");
            setPhase("failed");
            return;
          }
          // pending/running → start (or attach to) the run
          void streamRun(id, { existing: !isNewAgent && state.mode === "blank" });
          return;
        }
      }

      if (state.mode === "ready" && !isNewAgent) {
        router.replace("/");
        return;
      }
      setPhase("describe");
    })();
  }, [isNewAgent, params, router, streamRun]);

  const scaffoldMode: OnboardingState["mode"] =
    isNewAgent ? "missing" : (onboarding?.mode ?? "missing");

  const handleDescribeSubmit = useCallback(async () => {
    if (!onboarding || !prompt.trim()) return;
    const existing = !isNewAgent && onboarding.mode === "blank";
    const outputDir = existing
      ? (onboarding.projectRoot as string)
      : joinPath(baseDir || onboarding.onboardingCwd, slugify(name || prompt));

    const res = await fetch("/api/scaffold/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: prompt.trim(), outputDir }),
    });
    const data = await res.json();
    if (data.error) {
      toast.error(data.error);
      return;
    }
    setSessionId(data.id);
    setSteps((data.session as ScaffoldSession).steps);
    void streamRun(data.id, { existing });
  }, [baseDir, isNewAgent, onboarding, prompt, name, streamRun]);

  const handleContinue = useCallback(async () => {
    if (!result) return;
    await fetch("/api/onboarding/adopt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectRoot: result.projectRoot }),
    });
    await refreshProject().catch(() => {});
    toast.success(`${result.name ?? "Agent"} is ready`);
    router.push("/");
  }, [refreshProject, result, router]);

  const openFolder = useCallback(async () => {
    if (!result) return;
    await fetch("/api/open-folder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: result.projectRoot }),
    }).catch(() => {});
  }, [result]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <span className="font-semibold tracking-tight">Forge</span>
        <Badge variant="secondary">Scaffold</Badge>
      </header>

      {phase === "loading" && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
        </div>
      )}

      {phase === "describe" && onboarding && (
        <DescribeForm
          mode={scaffoldMode}
          prompt={prompt}
          name={name}
          baseDir={baseDir}
          projectRoot={onboarding.projectRoot ?? ""}
          onPrompt={setPrompt}
          onName={setName}
          onBaseDir={setBaseDir}
          onSubmit={handleDescribeSubmit}
        />
      )}

      {(phase === "running" || phase === "review" || phase === "failed") && (
        <RunView
          phase={phase}
          prompt={prompt}
          planLabel={planLabel}
          steps={steps}
          logs={logs}
          logOpen={logOpen}
          onToggleLog={() => setLogOpen((v) => !v)}
          logEndRef={logEndRef}
        />
      )}

      {phase === "review" && result && (
        <ReviewView result={result} onContinue={handleContinue} onOpenFolder={openFolder} />
      )}

      {phase === "failed" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Scaffold failed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{error}</pre>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (sessionId) {
                    const forceIntoExisting = error?.includes("not empty") ?? false;
                    void streamRun(sessionId, {
                      existing: !isNewAgent && onboarding?.mode === "blank",
                      force: forceIntoExisting,
                    });
                  }
                }}
              >
                {error?.includes("not empty") ? "Retry with --force" : "Retry"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(error ?? "").catch(() => {});
                  toast.success("Error copied");
                }}
              >
                Copy error
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DescribeForm({
  mode,
  prompt,
  name,
  baseDir,
  projectRoot,
  onPrompt,
  onName,
  onBaseDir,
  onSubmit,
}: {
  mode: "missing" | "blank" | "ready";
  prompt: string;
  name: string;
  baseDir: string;
  projectRoot: string;
  onPrompt: (v: string) => void;
  onName: (v: string) => void;
  onBaseDir: (v: string) => void;
  onSubmit: () => void;
}) {
  const [editingLocation, setEditingLocation] = useState(false);
  const folder = slugify(name || prompt || "my-agent");
  const cleanBase = baseDir.replace(/\/$/, "");
  const targetDir = mode === "blank" ? projectRoot : `${cleanBase}/${folder}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "blank" ? "Let's bring your agent to life" : "Describe your agent"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === "blank"
            ? "This Eve project is still a blank shell. Describe what it should do and Forge will fill in instructions, tools, and skills."
            : "No Eve agent here yet. Describe what you want in plain language and Forge will build it on top of a fresh Eve project — in the folder you launched from."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="prompt">What should your agent do?</Label>
        <Textarea
          id="prompt"
          rows={5}
          autoFocus
          placeholder="e.g. Monitor Stripe chargebacks over $500 and alert Slack before responding."
          value={prompt}
          onChange={(e) => onPrompt(e.target.value)}
        />
      </div>

      {mode !== "blank" && (
        <div className="space-y-2">
          <Label htmlFor="name">Project name (optional)</Label>
          <Input
            id="name"
            placeholder="my-agent"
            value={name}
            onChange={(e) => onName(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Location on disk
          </Label>
          {mode !== "blank" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setEditingLocation((v) => !v)}
            >
              <FolderOpen className="size-3.5" />
              {editingLocation ? "Done" : "Change location"}
            </Button>
          )}
        </div>

        {editingLocation && mode !== "blank" ? (
          <div className="space-y-1">
            <Input
              autoFocus
              value={baseDir}
              spellCheck={false}
              placeholder="/absolute/path/to/parent"
              onChange={(e) => onBaseDir(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Parent directory. The project folder is added inside it.
            </p>
          </div>
        ) : null}

        <p className="break-all font-mono text-xs text-foreground">
          {mode === "blank" ? "Updates " : "Creates "}
          {targetDir}
        </p>
      </div>

      <Button size="lg" disabled={!prompt.trim() || (mode !== "blank" && !cleanBase)} onClick={onSubmit}>
        <Sparkles className="size-4" /> Generate agent
      </Button>
    </div>
  );
}

function RunView({
  phase,
  prompt,
  planLabel,
  steps,
  logs,
  logOpen,
  onToggleLog,
  logEndRef,
}: {
  phase: WizardPhase;
  prompt: string;
  planLabel: string | null;
  steps: ScaffoldStepRecord[];
  logs: string[];
  logOpen: boolean;
  onToggleLog: () => void;
  logEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="space-y-5">
      <blockquote className="border-l-2 pl-4 text-lg font-medium leading-snug">
        “{prompt}”
      </blockquote>
      {planLabel && (
        <Badge variant="outline" className="font-mono text-xs">
          plan: {planLabel}
        </Badge>
      )}

      <ol className="space-y-1">
        {steps.map((step) => (
          <li
            key={step.id}
            className={cn(
              "flex items-start gap-3 rounded-md px-2 py-2 text-sm",
              step.status === "running" && "bg-muted/50",
            )}
          >
            <span className="mt-0.5 shrink-0">{STEP_ICON[step.status]}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn(step.status === "pending" && "text-muted-foreground")}>
                  {step.label}
                </span>
              </div>
              {step.detail && (
                <p className="truncate text-xs text-muted-foreground">{step.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {logs.length > 0 && (
        <div className="rounded-md border">
          <button
            type="button"
            onClick={onToggleLog}
            className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40"
          >
            <span>Live log ({logs.length})</span>
            <ChevronDown className={cn("size-4 transition-transform", logOpen && "rotate-180")} />
          </button>
          {logOpen && (
            <pre className="max-h-56 overflow-auto border-t bg-muted/30 p-3 text-[11px] leading-relaxed">
              {logs.join("\n")}
              <div ref={logEndRef} />
            </pre>
          )}
        </div>
      )}

      {phase === "running" && (
        <p className="text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline size-3 animate-spin" /> Building your agent…
        </p>
      )}
    </div>
  );
}

function classifyFiles(files: string[]) {
  return {
    tools: files.filter((f) => f.startsWith("agent/tools/")),
    skills: files.filter((f) => f.startsWith("agent/skills/")),
    evals: files.filter((f) => f.startsWith("evals/")),
    other: files.filter(
      (f) =>
        !f.startsWith("agent/tools/") &&
        !f.startsWith("agent/skills/") &&
        !f.startsWith("evals/"),
    ),
  };
}

function ReviewView({
  result,
  onContinue,
  onOpenFolder,
}: {
  result: ScaffoldResult;
  onContinue: () => void;
  onOpenFolder: () => void;
}) {
  const groups = classifyFiles(result.newFiles);
  const errors = result.diagnostics.filter((d) => d.startsWith("[error]"));
  const warnings = result.diagnostics.filter((d) => d.startsWith("[warning]"));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          {result.name ?? "Your agent"} is ready
        </h2>
        <div className="flex items-center gap-2">
          {result.planSource && (
            <Badge variant="secondary" className="font-mono text-xs">
              {result.planSource}
            </Badge>
          )}
          <span className="truncate text-xs text-muted-foreground">{result.projectRoot}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <BuiltCard title="Tools" items={groups.tools.map((f) => f.split("/").pop()!)} />
        <BuiltCard title="Skills" items={groups.skills.map((f) => f.split("/").pop()!)} />
        <BuiltCard title="Channels" items={result.channels} />
        <BuiltCard title="Evals" items={groups.evals.map((f) => f.split("/").pop()!)} />
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {[...errors, ...warnings].map((d, i) => (
              <p
                key={i}
                className={d.startsWith("[error]") ? "text-destructive" : "text-amber-500"}
              >
                {d}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={onContinue}>
          Continue to dashboard
        </Button>
        <Button variant="outline" onClick={onOpenFolder}>
          <FolderOpen className="size-4" /> Open folder
        </Button>
      </div>
    </div>
  );
}

function BuiltCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          {title}
          <span className="text-muted-foreground">{items.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">None</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {items.map((item) => (
              <li key={item} className="truncate font-mono">
                {item}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
