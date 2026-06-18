"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { AgentPreview } from "@/components/preview/agent-preview";
import { useStaging } from "@/context/staging-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FloatingAgentChat({
  agentName = "Agent",
  eveHost,
}: {
  agentName?: string;
  eveHost?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { hasStaged } = useStaging();

  return (
    <>
      <Button
        size="icon"
        className={cn(
          "fixed right-5 bottom-5 z-50 size-14 rounded-full shadow-lg",
          open && "scale-0 opacity-0",
        )}
        onClick={() => setOpen(true)}
        aria-label="Open agent preview chat"
      >
        <MessageCircle className="size-6" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close preview"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-[min(85vh,820px)] w-[min(96vw,520px)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">Test {agentName}</span>
                {hasStaged && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    Staged changes live
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)}>
                <X />
              </Button>
            </div>
            <p className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">
              Eve reads staged files from disk — stage edits, chat here, then publish when ready.
            </p>
            <div className="min-h-0 flex-1">
              <AgentPreview
                key={eveHost ?? "same-origin"}
                agentName={agentName}
                embedded
                eveHost={eveHost}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
