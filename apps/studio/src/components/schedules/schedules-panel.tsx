"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  Loader2,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import type { ScheduleData } from "@forge/core";
import { serializeSchedule, scheduleFilePath } from "@/lib/schedule-utils";
import type { ScheduleSuggestion } from "@/lib/schedule-suggestions";
import { CronScheduleBuilder } from "@/components/schedules/cron-schedule-builder";
import { useStaging } from "@/context/staging-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export function SchedulesPanel({
  onOpenFile,
  onRefresh,
}: {
  onOpenFile: (path: string) => void;
  onRefresh: () => void;
}) {
  const { stage, isStaged } = useStaging();
  const [schedules, setSchedules] = useState<ScheduleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ScheduleData | null>(null);
  const [id, setId] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<"markdown" | "typescript">("markdown");
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/schedules");
      const data = await res.json();
      setSchedules(data.schedules ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function applyDraft(draft: Pick<ScheduleSuggestion, "id" | "cron" | "prompt" | "title">) {
    setId(draft.id);
    setCron(draft.cron);
    setPrompt(draft.prompt);
    toast.message(`Loaded “${draft.title}” — tweak or click Create`);
  }

  async function createScheduleWith(
    values: { id: string; cron: string; prompt: string; format?: "markdown" | "typescript" },
    oneClick = false,
  ) {
    const scheduleId = values.id.trim().replace(/\.(md|ts)$/, "");
    if (!scheduleId || !values.cron.trim() || !values.prompt.trim()) {
      toast.error("Name, cron, and prompt are required");
      return;
    }
    if (schedules.some((s) => s.id === scheduleId)) {
      toast.error(`Schedule “${scheduleId}” already exists`);
      return;
    }

    setCreating(true);
    setCreatingId(scheduleId);
    try {
      const scheduleFormat = values.format ?? format;
      const path = scheduleFilePath(scheduleId, scheduleFormat);
      const content = serializeSchedule({
        cron: values.cron.trim(),
        prompt: values.prompt.trim(),
        format: scheduleFormat,
      });
      await stage(path, content);
      toast.success(
        oneClick
          ? `Staged ${scheduleId} — publish when ready`
          : `Staged ${scheduleId} for preview`,
      );
      if (!oneClick) {
        setId("");
        setPrompt("");
      }
      await load();
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
      setCreatingId(null);
    }
  }

  async function createSchedule() {
    await createScheduleWith({ id, cron, prompt, format });
  }

  async function generateFromDescription() {
    if (!aiPrompt.trim()) {
      toast.error("Describe when and what this schedule should do");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/schedules/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      if (data.id) setId(data.id);
      if (data.cron) setCron(data.cron);
      if (data.prompt) setPrompt(data.prompt);
      toast.success(data.cronLabel ? `Set to ${data.cronLabel}` : "Schedule draft generated");
      setAiPrompt("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function loadSuggestions() {
    setSuggesting(true);
    try {
      const res = await fetch("/api/schedules/suggest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not generate suggestions");
      setSuggestions(data.suggestions ?? []);
      if ((data.suggestions ?? []).length === 0) {
        toast.message("No new ideas right now — use the form below");
      } else {
        toast.success(`Generated ${data.suggestions.length} schedule ideas`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  }

  function startEdit(schedule: ScheduleData) {
    setEditingId(schedule.id);
    setEditDraft({ ...schedule });
  }

  async function stageEdit() {
    if (!editDraft) return;
    const content = serializeSchedule(editDraft);
    try {
      await stage(editDraft.sourcePath, content);
      toast.success(`Staged ${editDraft.sourcePath}`);
      setEditingId(null);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to stage");
    }
  }

  async function removeSchedule(scheduleId: string) {
    if (!confirm(`Delete schedule ${scheduleId}?`)) return;
    const res = await fetch(`/api/schedules?id=${encodeURIComponent(scheduleId)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Delete failed");
      return;
    }
    toast.success("Schedule deleted");
    if (editingId === scheduleId) {
      setEditingId(null);
      setEditDraft(null);
    }
    await load();
    onRefresh();
  }

  const existingIds = new Set(schedules.map((s) => s.id));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Schedules</h2>
        <p className="text-sm text-muted-foreground">
          Autonomous runs on a cron clock — digests, syncs, and sweeps while you sleep. Eve evaluates
          cron in UTC.
        </p>
      </div>

      {/* AI suggestions */}
      <Card className="border-violet-500/20 bg-violet-500/5">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="size-4 text-violet-400" />
                Suggested for this agent
              </CardTitle>
              <CardDescription className="text-xs">
                AI reads your tools, skills, and instructions to propose up to 3 relevant schedules.
              </CardDescription>
            </div>
            <Button size="sm" disabled={suggesting} onClick={() => void loadSuggestions()}>
              {suggesting ? <Loader2 className="animate-spin" /> : <Wand2 />}
              Generate ideas
            </Button>
          </div>
        </CardHeader>
        {suggestions.length > 0 && (
          <CardContent className="grid gap-3 md:grid-cols-3">
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                exists={existingIds.has(s.id)}
                busy={creatingId === s.id}
                onUse={() => applyDraft(s)}
                onCreate={() => void createScheduleWith(s, true)}
              />
            ))}
          </CardContent>
        )}
      </Card>

      {/* Existing schedules */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading schedules…
        </div>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No schedules yet — generate AI ideas or create one below.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Your schedules</h3>
          <div className="grid gap-3">
            {schedules.map((s) => (
              <Card key={s.id} size="sm">
                {editingId === s.id && editDraft ? (
                  <CardContent className="space-y-3 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Cron (UTC)</Label>
                        <Input
                          value={editDraft.cron}
                          onChange={(e) => setEditDraft({ ...editDraft, cron: e.target.value })}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Format</Label>
                        <Badge variant="outline">{editDraft.format}</Badge>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Prompt</Label>
                      <Textarea
                        rows={4}
                        value={editDraft.prompt}
                        onChange={(e) => setEditDraft({ ...editDraft, prompt: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void stageEdit()}>
                        <Save />
                        Stage changes
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                ) : (
                  <>
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-2">
                        <Clock className="size-4 text-muted-foreground" />
                        <CardTitle className="font-mono text-sm">{s.id}</CardTitle>
                        <Badge variant="outline">{s.format}</Badge>
                        {isStaged(s.sourcePath) && (
                          <Badge variant="secondary" className="text-[10px]">
                            staged
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        {s.cron && (
                          <code className="rounded bg-muted px-1 font-mono">{s.cron}</code>
                        )}
                      </CardDescription>
                      <CardDescription className="line-clamp-2 text-xs">{s.prompt}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => startEdit(s)}>
                        <Pencil />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => onOpenFile(s.sourcePath)}>
                        Open file
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeSchedule(s.id)}>
                        <Trash2 />
                        Delete
                      </Button>
                    </CardContent>
                  </>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Custom create form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Custom schedule</CardTitle>
          <CardDescription className="text-xs">
            Set cron and prompt for autonomous agent runs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Accordion className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3">
            <AccordionItem value="generate-ai" className="border-0">
              <AccordionTrigger className="py-3 hover:no-underline">
                <span className="flex items-center gap-2 text-xs font-medium">
                  <Sparkles className="size-3.5 text-violet-400" />
                  Generate with AI
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-2">
                  <Textarea
                    rows={2}
                    placeholder="e.g. Every weekday at 8am UTC, summarize new Plaid transactions and flag unusual spending"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="resize-none text-sm"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={generating}
                    onClick={() => void generateFromDescription()}
                  >
                    {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Generate schedule
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              placeholder="daily-digest"
              value={id}
              onChange={(e) => setId(e.target.value.replace(/\s+/g, "-").toLowerCase())}
            />
          </div>

          <CronScheduleBuilder cron={cron} onCronChange={setCron} />

          <div className="space-y-2">
            <Label>Prompt — what should the agent do?</Label>
            <Textarea
              rows={3}
              placeholder="Pull open issues and post a summary to Slack."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={format} onValueChange={(v) => v && setFormat(v as typeof format)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="markdown">Markdown (.md)</SelectItem>
                  <SelectItem value="typescript">TypeScript (.ts)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => void createSchedule()} disabled={creating} className="w-full sm:w-auto">
                {creating ? <Loader2 className="animate-spin" /> : <Plus />}
                Create schedule
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SuggestionCard({
  suggestion,
  exists,
  busy,
  onUse,
  onCreate,
}: {
  suggestion: ScheduleSuggestion;
  exists: boolean;
  busy: boolean;
  onUse: () => void;
  onCreate: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-violet-500/15 bg-background/60 p-3",
        exists && "opacity-60",
      )}
    >
      <div className="mb-1 text-xs font-medium">{suggestion.title}</div>
      <p className="mb-1 text-[10px] text-violet-300/80">{suggestion.cronLabel}</p>
      <p className="mb-2 line-clamp-2 text-[11px] text-muted-foreground">{suggestion.description}</p>
      {suggestion.rationale && (
        <p className="mb-3 line-clamp-2 text-[10px] italic text-muted-foreground">
          {suggestion.rationale}
        </p>
      )}
      <div className="mt-auto flex gap-1.5">
        <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={onUse}>
          Use
        </Button>
        <Button
          size="sm"
          className="h-7 flex-1 text-xs"
          disabled={exists || busy}
          onClick={onCreate}
        >
          {busy ? <Loader2 className="animate-spin" /> : "Add"}
        </Button>
      </div>
    </div>
  );
}
