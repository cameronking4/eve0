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
import type { StagedFileEntry } from "@forge/core";
import { useProject } from "@/context/project-context";

interface StagingContextValue {
  files: StagedFileEntry[];
  isLoading: boolean;
  hasStaged: boolean;
  refresh: () => Promise<void>;
  stage: (path: string, content: string) => Promise<void>;
  publish: (path: string) => Promise<void>;
  revert: (path: string) => Promise<void>;
  publishAll: () => Promise<void>;
  revertAll: () => Promise<void>;
  isStaged: (path: string) => boolean;
}

const StagingContext = createContext<StagingContextValue | null>(null);

async function parseStagingResponse(res: Response): Promise<void> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Staging request failed (${res.status})`);
  }
}

export function StagingProvider({ children }: { children: ReactNode }) {
  const { activeRoot } = useProject();
  const [files, setFiles] = useState<StagedFileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/staging");
    const data = await res.json();
    setFiles(data.files ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh, activeRoot]);

  const stage = useCallback(
    async (path: string, content: string) => {
      const res = await fetch("/api/staging", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stage", path, content }),
      });
      await parseStagingResponse(res);
      await refresh();
    },
    [refresh],
  );

  const publish = useCallback(
    async (path: string) => {
      const res = await fetch("/api/staging", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "publish", path }),
      });
      await parseStagingResponse(res);
      await refresh();
    },
    [refresh],
  );

  const revert = useCallback(
    async (path: string) => {
      const res = await fetch("/api/staging", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revert", path }),
      });
      await parseStagingResponse(res);
      await refresh();
    },
    [refresh],
  );

  const publishAll = useCallback(async () => {
    const res = await fetch("/api/staging", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "publishAll" }),
    });
    await parseStagingResponse(res);
    await refresh();
  }, [refresh]);

  const revertAll = useCallback(async () => {
    const res = await fetch("/api/staging", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "revertAll" }),
    });
    await parseStagingResponse(res);
    await refresh();
  }, [refresh]);

  const value = useMemo<StagingContextValue>(
    () => ({
      files,
      isLoading,
      hasStaged: files.length > 0,
      refresh,
      stage,
      publish,
      revert,
      publishAll,
      revertAll,
      isStaged: (path: string) => files.some((f) => f.path === path),
    }),
    [files, isLoading, refresh, stage, publish, revert, publishAll, revertAll],
  );

  return <StagingContext.Provider value={value}>{children}</StagingContext.Provider>;
}

export function useStaging() {
  const ctx = useContext(StagingContext);
  if (!ctx) throw new Error("useStaging must be used within StagingProvider");
  return ctx;
}
