"use client";

import { useEffect, useState } from "react";
import { Check, RotateCcw, Save } from "lucide-react";
import { DiffView } from "@/components/editor/diff-view";
import { useStaging } from "@/context/staging-context";
import { hasDiff } from "@/lib/diff-lines";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const INSTRUCTIONS_PATH = "agent/instructions.md";

export function InstructionsEditor({
  published,
  onRefresh,
}: {
  published: string;
  onRefresh: () => void;
}) {
  const { stage, publish, revert, isStaged, refresh: refreshStaging } = useStaging();
  const [draft, setDraft] = useState(published);
  const [selection, setSelection] = useState("");
  const [extractSlug, setExtractSlug] = useState("");
  const [extractDesc, setExtractDesc] = useState("");
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    setDraft(published);
  }, [published]);

  const dirty = draft !== published;
  const staged = isStaged(INSTRUCTIONS_PATH);

  async function applyStage() {
    await stage(INSTRUCTIONS_PATH, draft);
    toast.success("Instructions staged — test in chat, then publish");
    setShowDiff(false);
    onRefresh();
  }

  async function applyPublish() {
    if (dirty || staged) {
      await stage(INSTRUCTIONS_PATH, draft);
    }
    await publish(INSTRUCTIONS_PATH);
    toast.success("Instructions published to disk");
    onRefresh();
  }

  async function applyRevert() {
    await revert(INSTRUCTIONS_PATH);
    setDraft(published);
    toast.message("Reverted instructions");
    onRefresh();
  }

  async function extractSkill() {
    if (!selection || !extractSlug) return;
    await fetch("/api/instructions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "extract",
        selection,
        slug: extractSlug,
        description: extractDesc,
      }),
    });
    await refreshStaging();
    toast.success(`Staged skill: ${extractSlug}`);
    onRefresh();
  }

  return (
    <section className="mx-auto flex h-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold">System Prompt</h2>
          <p className="text-sm text-muted-foreground">agent/instructions.md</p>
        </div>
        {dirty && <Badge variant="secondary">Unsaved edits</Badge>}
        {staged && <Badge variant="outline">Staged</Badge>}
        <div className="ml-auto flex flex-wrap gap-2">
          {dirty && (
            <Button size="sm" variant="outline" onClick={() => setShowDiff((v) => !v)}>
              {showDiff ? "Hide diff" : "Review diff"}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={applyStage} disabled={!dirty}>
            <Check />
            Stage for preview
          </Button>
          <Button size="sm" onClick={applyPublish} disabled={!dirty && !staged}>
            <Save />
            Publish
          </Button>
          {(dirty || staged) && (
            <Button size="sm" variant="ghost" onClick={applyRevert}>
              <RotateCcw />
              Revert
            </Button>
          )}
        </div>
      </div>

      {showDiff && dirty && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Changes vs published</CardTitle>
            <CardDescription>GitHub-style line diff before staging</CardDescription>
          </CardHeader>
          <CardContent>
            <DiffView before={published} after={draft} className="h-64" />
          </CardContent>
        </Card>
      )}

      <Textarea
        rows={22}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onSelect={(e) => {
          const t = e.currentTarget;
          setSelection(t.value.substring(t.selectionStart, t.selectionEnd));
        }}
        className="min-h-[400px] flex-1 font-mono text-xs"
      />

      {selection && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Extract to skill</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <input
              className="flex h-8 rounded-md border bg-transparent px-2 text-sm"
              placeholder="skill-slug"
              value={extractSlug}
              onChange={(e) => setExtractSlug(e.target.value)}
            />
            <input
              className="flex h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
              placeholder="description"
              value={extractDesc}
              onChange={(e) => setExtractDesc(e.target.value)}
            />
            <Button onClick={extractSkill}>Extract selection</Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
