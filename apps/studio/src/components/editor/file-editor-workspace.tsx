"use client";

import { useEffect, useState } from "react";
import { Check, GitCompare, Loader2, RotateCcw, Save, Sparkles, X } from "lucide-react";
import { DiffView } from "@/components/editor/diff-view";
import { useStaging } from "@/context/staging-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function FileEditorWorkspace({
  path,
  initialContent,
  publishedContent,
  onPublished,
}: {
  path: string;
  initialContent: string;
  publishedContent: string;
  onPublished?: () => void;
}) {
  const { stage, publish, revert, isStaged } = useStaging();
  const [draft, setDraft] = useState(initialContent);
  const [proposed, setProposed] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staged = isStaged(path);
  const dirty = draft !== publishedContent;

  useEffect(() => {
    setDraft(initialContent);
    setProposed(null);
    setError(null);
  }, [path, initialContent]);

  async function suggestEdits() {
    if (!instruction.trim()) return;
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch("/api/edit/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, content: draft, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Suggestion failed");
      setProposed(data.proposedContent ?? "");
      toast.message("AI suggestion ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  }

  function acceptProposal() {
    if (proposed === null) return;
    setDraft(proposed);
    setProposed(null);
    toast.message("Accepted into editor — stage to preview in chat");
  }

  async function stageChanges() {
    const content = proposed ?? draft;
    if (proposed !== null) {
      setDraft(content);
      setProposed(null);
    }
    setBusy(true);
    try {
      await stage(path, content);
      toast.success("Staged — test in floating chat, then publish");
    } finally {
      setBusy(false);
    }
  }

  async function publishChanges() {
    setBusy(true);
    try {
      if (dirty || proposed !== null) {
        await stage(path, proposed ?? draft);
        if (proposed !== null) {
          setDraft(proposed);
          setProposed(null);
        }
      }
      await publish(path);
      toast.success(`Published ${path}`);
      onPublished?.();
    } finally {
      setBusy(false);
    }
  }

  async function revertChanges() {
    setBusy(true);
    try {
      await revert(path);
      setDraft(publishedContent);
      setProposed(null);
      toast.message("Reverted to published version");
      onPublished?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-mono text-sm font-medium">{path}</h2>
        {dirty && <Badge variant="secondary">Unsaved</Badge>}
        {staged && <Badge variant="outline">Staged · live in preview</Badge>}
        {proposed !== null && <Badge>AI proposal</Badge>}
      </div>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 rounded-lg border">
        <ResizablePanel defaultSize={52} minSize={30}>
          <div className="flex h-full flex-col">
            <div className="border-b px-3 py-2 text-sm font-medium">File contents</div>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0"
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={48} minSize={28}>
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
              <Sparkles className="size-4 text-primary" />
              AI-assisted editor
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-4 p-3">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle className="text-sm">Edit instruction</CardTitle>
                    <CardDescription>Full-file AI proposal with diff review</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      rows={4}
                      placeholder="Describe the change you want…"
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      className="text-sm"
                    />
                    <Button onClick={suggestEdits} disabled={suggesting || !instruction.trim()}>
                      {suggesting ? (
                        <>
                          <Loader2 className="animate-spin" />
                          Suggesting…
                        </>
                      ) : (
                        <>
                          <Sparkles />
                          Suggest edits
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {error && (
                  <Card size="sm" className="border-destructive/50">
                    <CardContent className="text-sm text-destructive">{error}</CardContent>
                  </Card>
                )}

                {proposed !== null && (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <GitCompare className="size-4" />
                        Proposed diff
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <DiffView before={draft} after={proposed} className="h-56" />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={acceptProposal}>
                          <Check />
                          Accept change
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void stageChanges()}>
                          Stage change
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setProposed(null)}>
                          <X />
                          Dismiss
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {(dirty || staged) && proposed === null && (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle className="text-sm">vs published on disk</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <DiffView before={publishedContent} after={draft} className="h-48" />
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>

            <div className="flex flex-wrap gap-2 border-t p-3">
              <Button
                variant="secondary"
                onClick={() => void stageChanges()}
                disabled={busy || (!dirty && proposed === null)}
              >
                <Check />
                Stage for preview
              </Button>
              <Button onClick={() => void publishChanges()} disabled={busy || (!dirty && !staged)}>
                {busy ? <Loader2 className="animate-spin" /> : <Save />}
                Publish
              </Button>
              {(dirty || staged) && (
                <Button variant="ghost" size="sm" onClick={() => void revertChanges()} disabled={busy}>
                  <RotateCcw />
                  Revert
                </Button>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
