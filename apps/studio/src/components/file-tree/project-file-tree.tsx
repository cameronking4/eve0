"use client";

import { useState } from "react";
import type { FileTreeNode } from "@forge/core";
import { ChevronRight, FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

export function ProjectFileTree({
  nodes,
  selectedPath,
  onSelect,
}: {
  nodes: FileTreeNode[];
  selectedPath?: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <ScrollArea className="h-full">
      <ul className="space-y-0.5 p-1">
        {nodes.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            selectedPath={selectedPath}
            onSelect={onSelect}
            depth={0}
          />
        ))}
      </ul>
    </ScrollArea>
  );
}

function TreeNode({
  node,
  selectedPath,
  onSelect,
  depth,
}: {
  node: FileTreeNode;
  selectedPath?: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  const paddingLeft = 8 + depth * 12;

  if (node.type === "directory") {
    return (
      <li>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger
            className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            style={{ paddingLeft }}
          >
            <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
            <Folder className="size-3.5 shrink-0" />
            <span className="truncate">{node.name}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="space-y-0.5">
              {node.children?.map((child) => (
                <TreeNode
                  key={child.path}
                  node={child}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                  depth={depth + 1}
                />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </li>
    );
  }

  const selected = selectedPath === node.path;

  return (
    <li>
      <Button
        variant={selected ? "secondary" : "ghost"}
        size="sm"
        className="h-7 w-full justify-start gap-1.5 px-2 font-mono text-xs"
        style={{ paddingLeft }}
        onClick={() => onSelect(node.path)}
      >
        <FileText className="size-3.5 shrink-0 opacity-70" />
        <span className="truncate">{node.name}</span>
      </Button>
    </li>
  );
}
