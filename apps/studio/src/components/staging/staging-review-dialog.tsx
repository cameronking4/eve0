"use client";

import { useEffect, useState } from "react";
import { FileDiff, Loader2, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import type { StagedFileEntry } from "@forge/core";
import { isStagedDeletion } from "@/lib/staging-utils";
import { DiffView } from "@/components/editor/diff-view";
import { useStaging } from "@/context/staging-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { hasDiff } from "@/lib/diff-lines";

export function StagingReviewDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { files, publish, revert, publishAll, revertAll } = useStaging();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (files.length === 0) {
      setSelectedPath(null);
      return;
    }
    if (!selectedPath || !files.some((f) => f.path === selectedPath)) {
      setSelectedPath(files[0]?.path ?? null);
    }
  }, [open, files, selectedPath]);

  const selected = files.find((f) => f.path === selectedPath) ?? null;

  async function runAction(
    key: string,
    action: () => Promise<void>,
    success: string,
  ) {
    setBusy(key);
    try {
      await action();
      toast.success(success);
      if (files.length <= 1) onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-[min(88vh,820px)] max-h-[88vh] w-[min(96vw,1100px)] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw]"
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2">
            <FileDiff className="size-4" />
            Staged changes
          </DialogTitle>
          <DialogDescription>
            Review diffs before publishing. Staged content is live in preview chat; publish writes
            to disk permanently.
          </DialogDescription>
        </DialogHeader>

        {files.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            No staged files.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/20">
              <div className="border-b px-3 py-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                {files.length} {files.length === 1 ? "file" : "files"}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {files.map((file) => (
                  <FileListItem
                    key={file.path}
                    file={file}
                    active={file.path === selectedPath}
                    onSelect={() => setSelectedPath(file.path)}
                  />
                ))}
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
                    <code className="min-w-0 flex-1 truncate text-xs">{selected.path}</code>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {countChanges(selected)} {countChanges(selected) === 1 ? "line" : "lines"} changed
                    </Badge>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() =>
                          void runAction(
                            `revert:${selected.path}`,
                            () => revert(selected.path),
                            `Reverted ${selected.path}`,
                          )
                        }
                      >
                        {busy === `revert:${selected.path}` ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <RotateCcw />
                        )}
                        Revert
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy !== null}
                        onClick={() =>
                          void runAction(
                            `publish:${selected.path}`,
                            () => publish(selected.path),
                            `Published ${selected.path}`,
                          )
                        }
                      >
                        {busy === `publish:${selected.path}` ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Upload />
                        )}
                        Publish
                      </Button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 p-3">
                    {isStagedDeletion(selected.staged) ? (
                      <div className="flex h-full max-h-[calc(88vh-220px)] flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                        <p className="text-sm font-medium text-destructive">Staged for deletion</p>
                        <p className="text-sm text-muted-foreground">
                          This file is removed from preview. Publish to delete permanently, or revert
                          to restore the published version.
                        </p>
                        <pre className="min-h-0 flex-1 overflow-auto rounded-md border bg-background/80 p-3 font-mono text-xs">
                          {selected.published || "(empty file)"}
                        </pre>
                      </div>
                    ) : (
                      <DiffView
                        before={selected.published}
                        after={selected.staged}
                        className="h-full max-h-[calc(88vh-220px)]"
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Select a file to review changes
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 border-t px-4 py-3 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Green = added · Red = removed · Preview chat already uses staged content
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={files.length === 0 || busy !== null}
              onClick={() =>
                void runAction("revertAll", revertAll, "All changes reverted")
              }
            >
              Revert all
            </Button>
            <Button
              disabled={files.length === 0 || busy !== null}
              onClick={() =>
                void runAction("publishAll", publishAll, "All changes published")
              }
            >
              {busy === "publishAll" ? <Loader2 className="animate-spin" /> : <Upload />}
              Publish all
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileListItem({
  file,
  active,
  onSelect,
}: {
  file: StagedFileEntry;
  active: boolean;
  onSelect: () => void;
}) {
  const deleted = isStagedDeletion(file.staged);
  const changed = deleted || hasDiff(file.published, file.staged);
  const name = file.path.split("/").pop() ?? file.path;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "mb-1 flex w-full flex-col rounded-lg border px-2.5 py-2 text-left transition-colors",
        active
          ? "border-primary/40 bg-primary/10"
          : "border-transparent hover:bg-accent/50",
      )}
    >
      <span className="truncate font-mono text-xs font-medium">{name}</span>
      <span className="truncate text-[10px] text-muted-foreground">{file.path}</span>
      {deleted && (
        <span className="mt-1 text-[10px] text-destructive">pending deletion</span>
      )}
      {changed && !deleted && (
        <span className="mt-1 text-[10px] text-emerald-400">
          +{countChanges(file)} lines
        </span>
      )}
    </button>
  );
}

function countChanges(file: StagedFileEntry): number {
  const pub = file.published.split("\n");
  const staged = file.staged.split("\n");
  let count = 0;
  const max = Math.max(pub.length, staged.length);
  for (let i = 0; i < max; i++) {
    if ((pub[i] ?? "") !== (staged[i] ?? "")) count++;
  }
  return count;
}
