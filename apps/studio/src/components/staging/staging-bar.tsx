"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { useProject } from "@/context/project-context";
import { useStaging } from "@/context/staging-context";
import { StagingReviewDialog } from "@/components/staging/staging-review-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StagingBar() {
  const { files, hasStaged, publishAll, revertAll } = useStaging();
  const { agentName, isWorkspace } = useProject();
  const [reviewOpen, setReviewOpen] = useState(false);

  if (!hasStaged && !isWorkspace) return null;

  return (
    <>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-sm",
          "bg-linear-to-r from-amber-200/90 via-rose-200/80 to-violet-200/90",
          "dark:from-amber-500/30 dark:via-rose-400/25 dark:to-violet-500/30",
          "dark:border-amber-400/25",
        )}
      >
        {isWorkspace && (
          <Badge variant="secondary" className="shrink-0 bg-background/70">
            Editing: {agentName}
          </Badge>
        )}
        {hasStaged && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 border-amber-600/30 bg-background/80 font-semibold shadow-sm hover:bg-background dark:border-amber-300/40"
              onClick={() => setReviewOpen(true)}
            >
              <Eye />
              {files.length} staged {files.length === 1 ? "file" : "files"}
            </Button>
            <span className="text-foreground/80 dark:text-foreground/90">
              Preview in chat uses staged content.{" "}
              <button
                type="button"
                className="font-medium underline underline-offset-2 hover:text-foreground"
                onClick={() => setReviewOpen(true)}
              >
                Review changes
              </button>{" "}
              before publishing.
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="bg-background/70"
                onClick={() => void revertAll()}
              >
                Revert all
              </Button>
              <Button size="sm" className="shadow-sm" onClick={() => void publishAll()}>
                Publish all
              </Button>
            </div>
          </>
        )}
      </div>

      <StagingReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} />
    </>
  );
}
