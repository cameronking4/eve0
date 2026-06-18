"use client";

import { useState } from "react";
import { LayoutGrid, Plus } from "lucide-react";
import { TOOL_GALLERY, type ToolGalleryItem } from "@/lib/tool-gallery";
import { useStaging } from "@/context/staging-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { toast } from "sonner";

function galleryToolBody(item: ToolGalleryItem): string {
  const approvalImport = item.needsApproval
    ? `import { always } from "eve/tools/approval";\n`
    : "";
  const approvalField = item.needsApproval ? "\n  needsApproval: always()," : "";

  const fields =
    item.inputFields.length === 0
      ? ""
      : item.inputFields
          .map((f) => {
            const zodType = f.type === "number" ? "z.number()" : f.type === "boolean" ? "z.boolean()" : "z.string()";
            const desc = f.description ? `.describe(${JSON.stringify(f.description)})` : "";
            return `    ${f.name}: ${zodType}${desc},`;
          })
          .join("\n");

  const inputSchema =
    item.inputFields.length === 0
      ? "z.object({})"
      : `z.object({\n${fields}\n  })`;

  const params =
    item.inputFields.length === 0
      ? ""
      : `{ ${item.inputFields.map((f) => f.name).join(", ")} }`;

  return `import { defineTool } from "eve/tools";
import { z } from "zod";
${approvalImport}
export default defineTool({
  description: ${JSON.stringify(item.description)},
  inputSchema: ${inputSchema},${approvalField}
  async execute(${params}) {
${item.implementation}
  },
});
`;
}

export function ToolGallerySheet({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const { refresh: refreshStaging } = useStaging();

  async function addFromGallery(item: ToolGalleryItem) {
    setAdding(item.id);
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "gallery",
          name: item.name,
          content: galleryToolBody(item),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add tool");
      await refreshStaging();
      toast.success(`Staged ${item.name} from gallery`);
      setOpen(false);
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(null);
    }
  }

  const categories = [...new Set(TOOL_GALLERY.map((t) => t.category))];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <LayoutGrid />
          Add from Gallery
        </Button>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Tool Gallery</SheetTitle>
          <SheetDescription>
            Visual node editor — compose inputs, logic, and output. Stages generated TypeScript to your agent.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          {categories.map((category) => (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">{category}</h3>
              <div className="grid gap-2">
                {TOOL_GALLERY.filter((t) => t.category === category).map((item) => (
                  <Card key={item.id} size="sm">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="font-mono text-sm">{item.name}</CardTitle>
                          <CardDescription>{item.description}</CardDescription>
                        </div>
                        {item.needsApproval && <Badge variant="destructive">approval</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button
                        size="sm"
                        disabled={adding === item.id}
                        onClick={() => addFromGallery(item)}
                      >
                        <Plus />
                        {adding === item.id ? "Adding…" : "Add tool"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
