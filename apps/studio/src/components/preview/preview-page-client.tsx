"use client";

import { AgentPreview } from "@/components/preview/agent-preview";
import { AgentSelector } from "@/components/agent-selector";
import { OpenAgentFolderButton } from "@/components/open-agent-folder-button";
import { useProject } from "@/context/project-context";
import { Skeleton } from "@/components/ui/skeleton";

export function PreviewPageClient() {
  const { agentName, previewHost, isLoading, isSwitching, activeRoot } = useProject();

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col gap-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <AgentSelector variant="compact" />
        <OpenAgentFolderButton />
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {isSwitching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
            <p className="text-sm text-muted-foreground">Loading agent…</p>
          </div>
        )}
        <AgentPreview
          key={activeRoot}
          agentName={agentName}
          agentScope={activeRoot}
          eveHost={previewHost}
        />
      </div>
    </div>
  );
}
