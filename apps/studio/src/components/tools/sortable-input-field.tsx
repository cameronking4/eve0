"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import type { ToolFlowField } from "@/lib/tool-flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function SortableInputField({
  field,
  onUpdate,
  onRemove,
}: {
  field: ToolFlowField;
  onUpdate: (patch: Partial<ToolFlowField>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border bg-background p-2 touch-none",
        isDragging && "z-10 opacity-80 shadow-lg ring-2 ring-primary/30",
      )}
    >
      <div className="mb-1 flex items-center gap-1">
        <button
          type="button"
          className="flex shrink-0 cursor-grab items-center rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
        <Input
          value={field.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="h-7 flex-1 font-mono text-xs"
        />
        <Select
          value={field.type}
          onValueChange={(v) => v && onUpdate({ type: v as ToolFlowField["type"] })}
        >
          <SelectTrigger className="h-7 w-[72px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="string">str</SelectItem>
            <SelectItem value="number">num</SelectItem>
            <SelectItem value="boolean">bool</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon-sm" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      <Input
        placeholder="Field description for the model"
        value={field.description ?? ""}
        onChange={(e) => onUpdate({ description: e.target.value })}
        className="h-7 text-xs"
      />
    </div>
  );
}
