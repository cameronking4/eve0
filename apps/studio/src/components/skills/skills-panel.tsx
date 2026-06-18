"use client";

import { useEffect, useState } from "react";
import { Check, Plus, RotateCcw, Save } from "lucide-react";
import type { SkillData } from "@forge/core";
import { DiffView } from "@/components/editor/diff-view";
import { useStaging } from "@/context/staging-context";
import { SKILL_GALLERY, parseSkillFile, serializeSkillFile, skillFilePath } from "@/lib/skill-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function SkillsPanel({
  skills,
  onRefresh,
}: {
  skills: SkillData[];
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(skills[0]?.slug ?? null);
  const [published, setPublished] = useState("");
  const [draft, setDraft] = useState<SkillData | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const { stage, publish, revert, isStaged } = useStaging();

  const path = selected ? skillFilePath(selected) : null;
  const staged = path ? isStaged(path) : false;

  useEffect(() => {
    if (skills.length && !skills.some((s) => s.slug === selected)) {
      setSelected(skills[0]?.slug ?? null);
    }
  }, [skills, selected]);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      setPublished("");
      return;
    }
    void loadSkill(selected);
  }, [selected]);

  async function loadSkill(slug: string) {
    const p = skillFilePath(slug);
    const [fileRes, stagingRes] = await Promise.all([
      fetch(`/api/file?path=${encodeURIComponent(p)}`),
      fetch("/api/staging"),
    ]);
    const fileData = await fileRes.json();
    const stagingData = await stagingRes.json();
    const stagedEntry = stagingData.files?.find((f: { path: string }) => f.path === p);
    const content = fileData.content ?? "";
    setPublished(stagedEntry?.published ?? content);
    setDraft(parseSkillFile(content, slug));
  }
  const draftSerialized = draft ? serializeSkillFile(draft) : "";
  const publishedSerialized = draft
    ? serializeSkillFile(published ? parseSkillFile(published, draft.slug) : draft)
    : "";
  const dirty = draftSerialized !== publishedSerialized && draft !== null;

  async function addFromGallery(item: (typeof SKILL_GALLERY)[number]) {
    setBusy(true);
    try {
      const content = serializeSkillFile(item);
      await stage(skillFilePath(item.slug), content);
      toast.success(`Staged skill: ${item.slug}`);
      onRefresh();
      setSelected(item.slug);
    } finally {
      setBusy(false);
    }
  }

  async function createSkill() {
    const slug = prompt("Skill slug (e.g. my-workflow)");
    if (!slug?.trim()) return;
    const content = serializeSkillFile({
      slug: slug.trim(),
      description: "New skill",
      body: "## Workflow\n\nDescribe procedures here.",
    });
    await stage(skillFilePath(slug.trim()), content);
    toast.success("Skill staged — preview in chat, then publish");
    onRefresh();
    setSelected(slug.trim());
  }

  async function stageSkill() {
    if (!draft || !path) return;
    setBusy(true);
    try {
      await stage(path, serializeSkillFile(draft));
      toast.success("Skill staged for preview");
      setShowDiff(false);
    } finally {
      setBusy(false);
    }
  }

  async function publishSkill() {
    if (!draft || !path) return;
    setBusy(true);
    try {
      if (dirty) await stage(path, serializeSkillFile(draft));
      await publish(path);
      toast.success("Skill published");
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function revertSkill() {
    if (!path) return;
    setBusy(true);
    try {
      await revert(path);
      await loadSkill(selected!);
      toast.message("Reverted skill");
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex h-[calc(100vh-8rem)] min-h-0 gap-4">
      <div className="flex w-56 shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Skills</h2>
          <Button size="sm" variant="outline" onClick={createSkill}>
            <Plus />
          </Button>
        </div>
        <ScrollArea className="flex-1 rounded-md border p-1">
          {skills.map((s) => (
            <Button
              key={s.slug}
              variant={selected === s.slug ? "secondary" : "ghost"}
              size="sm"
              className="mb-0.5 w-full justify-start font-mono text-xs"
              onClick={() => setSelected(s.slug)}
            >
              {s.slug}
            </Button>
          ))}
        </ScrollArea>
        <Button variant="outline" size="sm" className="w-full" onClick={() => setGalleryOpen(true)}>
          Add from Gallery
        </Button>
        <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Skill Gallery</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {SKILL_GALLERY.map((item) => (
                <Card key={item.slug} size="sm">
                  <CardHeader>
                    <CardTitle className="font-mono text-sm">{item.slug}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button size="sm" disabled={busy} onClick={() => addFromGallery(item)}>
                      Stage skill
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {draft && path ? (
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{path}</span>
            {dirty && <Badge variant="secondary">Unsaved</Badge>}
            {staged && <Badge variant="outline">Staged</Badge>}
            <div className="ml-auto flex gap-2">
              {dirty && (
                <Button size="sm" variant="outline" onClick={() => setShowDiff((v) => !v)}>
                  {showDiff ? "Hide diff" : "Review diff"}
                </Button>
              )}
              <Button size="sm" variant="secondary" disabled={!dirty || busy} onClick={stageSkill}>
                <Check />
                Stage
              </Button>
              <Button size="sm" disabled={busy || (!dirty && !staged)} onClick={publishSkill}>
                <Save />
                Publish
              </Button>
              {(dirty || staged) && (
                <Button size="sm" variant="ghost" onClick={revertSkill} disabled={busy}>
                  <RotateCcw />
                </Button>
              )}
            </div>
          </div>

          {showDiff && dirty && (
            <DiffView before={publishedSerialized} after={draftSerialized} className="h-48" />
          )}

          <div className="grid gap-3 md:grid-cols-[240px_1fr]">
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
          </div>
          <Textarea
            className="min-h-0 flex-1 font-mono text-xs"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Select or create a skill
        </div>
      )}
    </section>
  );
}
