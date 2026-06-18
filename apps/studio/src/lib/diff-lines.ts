import { diffLines } from "diff";

export type DiffLineType = "added" | "removed" | "unchanged";

export interface DiffLine {
  type: DiffLineType;
  content: string;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const parts = diffLines(oldText, newText);
  const lines: DiffLine[] = [];

  for (const part of parts) {
    const type: DiffLineType = part.added ? "added" : part.removed ? "removed" : "unchanged";
    const chunks = part.value.split("\n");
    const slice = part.value.endsWith("\n") ? chunks.slice(0, -1) : chunks;
    for (const content of slice) {
      lines.push({ type, content });
    }
  }

  return lines;
}

export function hasDiff(oldText: string, newText: string): boolean {
  return oldText !== newText;
}
