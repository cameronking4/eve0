import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function fileManagerName(): string {
  switch (process.platform) {
    case "darwin":
      return "Finder";
    case "win32":
      return "File Explorer";
    default:
      return "file manager";
  }
}

export async function openPathInFileManager(path: string): Promise<void> {
  if (!existsSync(path)) {
    throw new Error(`Folder not found: ${path}`);
  }

  switch (process.platform) {
    case "darwin":
      await execFileAsync("open", [path]);
      return;
    case "win32":
      await execFileAsync("explorer", [path]);
      return;
    default:
      await execFileAsync("xdg-open", [path]);
  }
}
