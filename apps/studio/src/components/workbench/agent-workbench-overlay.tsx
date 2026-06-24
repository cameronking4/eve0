"use client";

import { AgentEditChat } from "@/components/workbench/agent-edit-chat";
import { AgentPreview } from "@/components/preview/agent-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useStaging } from "@/context/staging-context";
import { Sparkles, X } from "lucide-react";
import { useEffect } from "react";

export function AgentWorkbenchOverlay({
  open,
  onClose,
  agentName = "Agent",
  agentScope,
  eveHost,
}: {
  open: boolean;
  onClose: () => void;
  agentName?: string;
  agentScope?: string;
  eveHost?: string | null;
}) {
  const { hasStaged } = useStaging();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-semibold">Edit agent with AI</span>
        <Badge variant="secondary" className="hidden sm:inline-flex">
          {agentName}
        </Badge>
        {hasStaged ? (
          <Badge variant="outline" className="hidden text-[10px] sm:inline-flex">
            Staged changes live
          </Badge>
        ) : null}
        <Button
          className="ml-auto"
          size="sm"
          variant="ghost"
          onClick={onClose}
        >
          <X className="size-4" />
          Close
        </Button>
      </header>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={45} minSize={30}>
          <div className="flex h-full min-h-0 flex-col">
            <AgentEditChat agentName={agentName} />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={55} minSize={30}>
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
              <span className="text-sm font-medium">Live preview</span>
              <span className="text-xs text-muted-foreground">Test {agentName}</span>
            </div>
            <div className="min-h-0 flex-1">
              <AgentPreview
                key={agentScope ?? eveHost ?? "same-origin"}
                agentName={agentName}
                agentScope={agentScope}
                embedded
                eveHost={eveHost}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
