import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { FileTreeNode } from "./types.js";

async function buildTree(dir: string, root: string): Promise<FileTreeNode[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nodes: FileTreeNode[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: "directory",
        children: await buildTree(fullPath, root),
      });
    } else {
      nodes.push({ name: entry.name, path: relPath, type: "file" });
    }
  }

  return nodes;
}

export async function getProjectFileTree(projectRoot: string): Promise<FileTreeNode[]> {
  const roots = ["agent", "evals"];
  const tree: FileTreeNode[] = [];

  for (const name of roots) {
    const dir = join(projectRoot, name);
    try {
      const st = await stat(dir);
      if (!st.isDirectory()) continue;
      tree.push({
        name,
        path: name,
        type: "directory",
        children: await buildTree(dir, projectRoot),
      });
    } catch {
      // skip missing
    }
  }

  return tree;
}

export async function readProjectFile(projectRoot: string, relPath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(join(projectRoot, relPath), "utf-8");
}

export async function writeProjectFile(
  projectRoot: string,
  relPath: string,
  content: string,
): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const full = join(projectRoot, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, "utf-8");
}
