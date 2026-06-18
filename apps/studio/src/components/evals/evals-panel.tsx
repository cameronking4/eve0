"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Save,
  XCircle,
} from "lucide-react";
import type { EvalInfo, EvalRunReport } from "@forge/core";
import { DiffView } from "@/components/editor/diff-view";
import { useStaging } from "@/context/staging-context";
import { defaultEvalTemplate, evalFilePath } from "@/lib/eval-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function EvalsPanel() {
  const [evals, setEvals] = useState<EvalInfo[]>([]);
  const [runSelected, setRunSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<EvalRunReport | null>(null);
  const [published, setPublished] = useState("");
  const [draft, setDraft] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [busy, setBusy] = useState(false);
  const { stage, publish, revert, isStaged } = useStaging();

  const editing = evals.find((e) => e.id === editingId) ?? null;
  const path = editing?.sourcePath ?? (editingId ? evalFilePath(editingId) : null);
  const staged = path ? isStaged(path) : false;
  const dirty = draft !== published && path !== null;

  const load = useCallback(async (): Promise<EvalInfo[]> => {
    setLoading(true);
    try {
      const res = await fetch("/api/evals");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load evals");
      const list: EvalInfo[] = data.evals ?? [];
      setEvals(list);
      setRunSelected(new Set(list.map((e) => e.id)));
      return list;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load().then((list) => {
      if (list.length) setEditingId((current) => current ?? list[0].id);
    });
  }, [load]);

  useEffect(() => {
    if (!editingId) {
      setDraft("");
      setPublished("");
      return;
    }
    void loadEvalFile(editingId);
  }, [editingId]);

  async function loadEvalFile(id: string) {
    const ev = evals.find((e) => e.id === id);
    const p = ev?.sourcePath ?? evalFilePath(id);
    const [fileRes, stagingRes] = await Promise.all([
      fetch(`/api/file?path=${encodeURIComponent(p)}`),
      fetch("/api/staging"),
    ]);
    const fileData = await fileRes.json();
    const stagingData = await stagingRes.json();
    const stagedEntry = stagingData.files?.find((f: { path: string }) => f.path === p);
    const content = fileData.content ?? "";
    setPublished(stagedEntry?.published ?? content);
    setDraft(content);
    setShowDiff(false);
  }

  function toggleRun(id: string) {
    setRunSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runEvals(all = false) {
    setRunning(true);
    setReport(null);
    try {
      const ids = all ? undefined : [...runSelected];
      if (!all && (!ids || ids.length === 0)) {
        toast.error("Select at least one eval");
        return;
      }
      const res = await fetch("/api/evals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok && !data.results) throw new Error(data.error ?? "Eval run failed");
      setReport(data as EvalRunReport);
      if (data.passed) toast.success("All evals passed");
      else {
        const failed = data.results?.filter((r: { passed: boolean }) => !r.passed).length ?? "?";
        toast.error(`${failed} eval(s) failed`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function createEval() {
    const id = prompt("Eval id (e.g. smoke, weather/brooklyn-forecast)");
    if (!id?.trim()) return;
    const p = evalFilePath(id.trim());
    await stage(p, defaultEvalTemplate(id.trim()));
    toast.success("Eval staged — edit, run, then publish");
    await load();
    setEditingId(id.trim().replace(/^evals\//, "").replace(/\.eval\.ts$/, ""));
  }

  async function stageEval() {
    if (!path) return;
    setBusy(true);
    try {
      await stage(path, draft);
      toast.success("Eval staged for preview runs");
      setShowDiff(false);
    } finally {
      setBusy(false);
    }
  }

  async function publishEval() {
    if (!path) return;
    setBusy(true);
    try {
      if (dirty) await stage(path, draft);
      await publish(path);
      setPublished(draft);
      toast.success("Eval published to disk");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revertEval() {
    if (!path || !editingId) return;
    setBusy(true);
    try {
      await revert(path);
      await loadEvalFile(editingId);
      toast.message("Reverted eval");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex h-[calc(100vh-8rem)] min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Evals</h2>
          <p className="text-sm text-muted-foreground">
            Edit, stage, and run{" "}
            <a
              href="https://eve.dev/docs/evals/overview"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              Eve evals
              <ExternalLink className="size-3" />
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
          <Button size="sm" disabled={running} onClick={() => void runEvals(false)}>
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            Run selected
          </Button>
          <Button size="sm" variant="secondary" disabled={running} onClick={() => void runEvals(true)}>
            Run all
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex w-56 shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Eval files</span>
            <Button size="sm" variant="outline" onClick={() => void createEval()}>
              <Plus />
            </Button>
          </div>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : evals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No evals yet</p>
          ) : (
            <ScrollArea className="flex-1 rounded-md border p-1">
              {evals.map((ev) => (
                <div key={ev.id} className="mb-0.5 flex items-center gap-1">
                  <Checkbox
                    checked={runSelected.has(ev.id)}
                    onCheckedChange={() => toggleRun(ev.id)}
                    className="ml-1"
                    aria-label={`Include ${ev.id} in run`}
                  />
                  <Button
                    variant={editingId === ev.id ? "secondary" : "ghost"}
                    size="sm"
                    className="min-w-0 flex-1 justify-start truncate font-mono text-xs"
                    onClick={() => setEditingId(ev.id)}
                  >
                    {ev.id}
                  </Button>
                </div>
              ))}
            </ScrollArea>
          )}
        </div>

        {path ? (
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{path}</span>
              {dirty && <Badge variant="secondary">Unsaved</Badge>}
              {staged && <Badge variant="outline">Staged</Badge>}
              <div className="ml-auto flex flex-wrap gap-2">
                {dirty && (
                  <Button size="sm" variant="outline" onClick={() => setShowDiff((v) => !v)}>
                    {showDiff ? "Hide diff" : "Review diff"}
                  </Button>
                )}
                <Button size="sm" variant="secondary" disabled={!dirty || busy} onClick={() => void stageEval()}>
                  <Check />
                  Stage
                </Button>
                <Button
                  size="sm"
                  disabled={busy || (!dirty && !staged)}
                  onClick={() => void publishEval()}
                >
                  <Save />
                  Publish
                </Button>
                {(dirty || staged) && (
                  <Button size="sm" variant="ghost" onClick={() => void revertEval()} disabled={busy}>
                    <RotateCcw />
                  </Button>
                )}
              </div>
            </div>

            {showDiff && dirty ? (
              <ScrollArea className="min-h-0 flex-1 rounded-lg border">
                <DiffView before={published} after={draft} />
              </ScrollArea>
            ) : (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-0 flex-1 resize-none font-mono text-xs leading-relaxed"
                spellCheck={false}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select or create an eval to edit
          </div>
        )}
      </div>

      {report && (
        <Card className="shrink-0">
          <CardHeader className="py-3">
            <div className="flex items-center gap-2">
              {report.passed ? (
                <CheckCircle2 className="size-4 text-green-500" />
              ) : (
                <XCircle className="size-4 text-destructive" />
              )}
              <CardTitle className="text-sm">
                Last run — {report.passed ? "passed" : "failed"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="max-h-48 space-y-2 overflow-y-auto pb-3">
            {report.results.map((result) => (
              <div
                key={result.id}
                className={cn(
                  "rounded border px-2 py-1.5 text-xs",
                  !result.passed && "border-destructive/30 bg-destructive/5",
                )}
              >
                <span className="font-mono font-medium">{result.id}</span>
                {" — "}
                {result.passed ? "pass" : "fail"}
                {result.result?.assertions?.filter((a) => a.passed === false).map((a) => (
                  <div key={a.name} className="mt-1 text-destructive">
                    {a.name}: {a.message}
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
