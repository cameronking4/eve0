"use client";

import { useState } from "react";
import type { FileTreeNode } from "@forge/core";
import { AgentSelector } from "@/components/agent-selector";
import { OpenAgentFolderButton } from "@/components/open-agent-folder-button";
import { ProjectFileTree } from "@/components/file-tree/project-file-tree";
import { StudioNav, type StudioPanel } from "@/components/shell/studio-nav";
import { cn } from "@/lib/utils";

type StudioSidebarProps = {
  panel: StudioPanel;
  onPanelChange: (panel: StudioPanel) => void;
  tree: FileTreeNode[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onAgentSwitch: () => void | Promise<void>;
  disabled?: boolean;
};

export function StudioSidebar({
  panel,
  onPanelChange,
  tree,
  selectedFile,
  onSelectFile,
  onAgentSwitch,
  disabled,
}: StudioSidebarProps) {
  const [navOpen, setNavOpen] = useState(true);

  return (
    <aside
      className={cn(
        "flex w-[min(100vw-2rem,17rem)] shrink-0 flex-col border-r bg-muted/20",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex shrink-0 flex-col gap-1.5 border-b p-2">
        <AgentSelector onSwitch={onAgentSwitch} />
        <div className="sm:hidden">
          <OpenAgentFolderButton className="w-full" />
        </div>
        <StudioNav
          active={panel}
          open={navOpen}
          onOpenChange={setNavOpen}
          onSelect={onPanelChange}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Files
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background/60 p-1">
          <ProjectFileTree nodes={tree} selectedPath={selectedFile} onSelect={onSelectFile} />
        </div>
      </div>
    </aside>
  );
}
