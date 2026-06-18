"use client";

import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useProject } from "@/context/project-context";

export function OpenAgentFolderButton({ className }: { className?: string }) {
  const { activeRoot } = useProject();
  const [opening, setOpening] = useState(false);
  const [fileManager, setFileManager] = useState("folder");

  useEffect(() => {
    fetch("/api/open-folder")
      .then((res) => res.json())
      .then((data) => {
        if (data.fileManager) setFileManager(data.fileManager);
      })
      .catch(() => {});
  }, []);

  if (!activeRoot) return null;

  async function openFolder() {
    setOpening(true);
    try {
      const res = await fetch("/api/open-folder", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      toast.success(`Opened in ${data.fileManager ?? fileManager}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open folder");
    } finally {
      setOpening(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={opening}
      onClick={openFolder}
    >
      <FolderOpen className="size-3.5" />
      {opening ? "Opening…" : `Open in ${fileManager}`}
    </Button>
  );
}
