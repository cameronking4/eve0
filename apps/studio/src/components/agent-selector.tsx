"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProject } from "@/context/project-context";

export function AgentSelector({ onSwitch }: { onSwitch?: () => void | Promise<void> }) {
  const { isWorkspace, agents, activeRoot, isSwitching, switchAgent } = useProject();

  if (!isWorkspace || agents.length <= 1) return null;

  return (
    <div className="border-b p-2">
      <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Agent</p>
      <Select
        value={activeRoot}
        disabled={isSwitching}
        onValueChange={async (root) => {
          if (!root) return;
          await switchAgent(root);
          await onSwitch?.();
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select agent" />
        </SelectTrigger>
        <SelectContent>
          {agents.map((agent) => (
            <SelectItem key={agent.root} value={agent.root}>
              {agent.relativePath === "."
                ? agent.name
                : `${agent.name} (${agent.relativePath})`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
