"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

export interface WorkspaceAgent {
  root: string;
  name: string;
  relativePath: string;
}

interface ProjectContextValue {
  isWorkspace: boolean;
  workspaceRoot: string | null;
  activeRoot: string;
  agents: WorkspaceAgent[];
  agentName: string;
  previewHost: string | null;
  usePreviewProxy: boolean;
  isLoading: boolean;
  isSwitching: boolean;
  switchAgent: (root: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [isWorkspace, setIsWorkspace] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [activeRoot, setActiveRoot] = useState("");
  const [agents, setAgents] = useState<WorkspaceAgent[]>([]);
  const [agentName, setAgentName] = useState("Eve Agent");
  const [previewHost, setPreviewHost] = useState<string | null>(null);
  const [usePreviewProxy, setUsePreviewProxy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    setIsWorkspace(Boolean(data.isWorkspace));
    setWorkspaceRoot(data.workspaceRoot ?? null);
    setActiveRoot(data.activeRoot ?? "");
    setAgents(data.agents ?? []);
    setAgentName(data.agentName ?? data.agents?.[0]?.name ?? "Eve Agent");
    setPreviewHost(data.previewHost ?? null);
    setUsePreviewProxy(Boolean(data.usePreviewProxy));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to load workspace");
      setIsLoading(false);
    });
  }, [refresh]);

  const switchAgent = useCallback(
    async (root: string) => {
      if (root === activeRoot) return;
      setIsSwitching(true);
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ root }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setActiveRoot(data.activeRoot);
        setAgentName(data.agentName ?? "Eve Agent");
        setPreviewHost(data.previewHost ?? null);
        setUsePreviewProxy(Boolean(data.usePreviewProxy));
        toast.success(`Switched to ${data.agentName ?? "agent"}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to switch agent");
        throw error;
      } finally {
        setIsSwitching(false);
      }
    },
    [activeRoot],
  );

  const value = useMemo(
    () => ({
      isWorkspace,
      workspaceRoot,
      activeRoot,
      agents,
      agentName,
      previewHost,
      usePreviewProxy,
      isLoading,
      isSwitching,
      switchAgent,
      refresh,
    }),
    [
      isWorkspace,
      workspaceRoot,
      activeRoot,
      agents,
      agentName,
      previewHost,
      usePreviewProxy,
      isLoading,
      isSwitching,
      switchAgent,
      refresh,
    ],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
