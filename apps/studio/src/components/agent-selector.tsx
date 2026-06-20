"use client";

import { useState } from "react";
import { Bot, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useProject, type WorkspaceAgent } from "@/context/project-context";
import {
  SidebarControlTriggerContent,
  sidebarControlTriggerClassName,
} from "@/components/shell/sidebar-control-trigger";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function AgentSelector({
  onSwitch,
  variant = "sidebar",
  className,
}: {
  onSwitch?: () => void | Promise<void>;
  variant?: "sidebar" | "compact";
  className?: string;
}) {
  const { isWorkspace, agents, activeRoot, agentName, isSwitching, switchAgent } = useProject();
  const [open, setOpen] = useState(false);

  if (!isWorkspace || agents.length <= 1) return null;

  const activeAgent = agents.find((agent) => agent.root === activeRoot);

  const handleSelect = async (root: string) => {
    if (root === activeRoot || isSwitching) return;
    try {
      await switchAgent(root);
      await onSwitch?.();
      setOpen(false);
    } catch {
      // switchAgent surfaces errors via toast
    }
  };

  const subtitle =
    activeAgent?.relativePath === "."
      ? "Workspace root"
      : (activeAgent?.relativePath ?? "Select agent");

  const trailing = isSwitching ? (
    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
  ) : (
    <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground/70" />
  );

  const selector = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={isSwitching}
        render={
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            className={sidebarControlTriggerClassName(open)}
          />
        }
      >
        <SidebarControlTriggerContent
          icon={Bot}
          title={agentName}
          subtitle={subtitle}
          trailing={trailing}
        />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-(--anchor-width) min-w-[15rem] gap-0 p-0"
      >
        <PopoverHeader className="gap-1 border-b px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle className="text-sm">Switch agent</PopoverTitle>
            <Badge variant="secondary" className="text-[10px]">
              {agents.length}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Preview chat and file edits follow the active agent.
          </p>
        </PopoverHeader>

        <div className="max-h-64 overflow-y-auto p-1">
          {agents.map((agent) => (
            <AgentOption
              key={agent.root}
              agent={agent}
              active={agent.root === activeRoot}
              disabled={isSwitching}
              onSelect={() => handleSelect(agent.root)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );

  if (variant === "compact") {
    return <div className={cn("min-w-[220px]", className)}>{selector}</div>;
  }

  return <div className={className}>{selector}</div>;
}

function AgentOption({
  agent,
  active,
  disabled,
  onSelect,
}: {
  agent: WorkspaceAgent;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
        active
          ? "bg-primary/10 text-foreground ring-1 ring-primary/15"
          : "text-foreground hover:bg-muted/80",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Bot className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{agent.name}</span>
          {active ? (
            <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
          ) : null}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {agent.relativePath === "." ? "Workspace root" : agent.relativePath}
        </span>
      </span>
    </button>
  );
}
