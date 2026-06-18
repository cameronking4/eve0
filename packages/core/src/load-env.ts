import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

/** Load the first existing env file from the list (later files are skipped). */
export function loadEnvFileIfExists(path: string): boolean {
  if (!existsSync(path)) return false;
  loadEnvFile(path);
  return true;
}

/** Load project env files; `.env.local` wins over `.env` when both exist. */
export function loadProjectEnv(projectRoot: string): void {
  loadEnvFileIfExists(`${projectRoot}/.env.local`) || loadEnvFileIfExists(`${projectRoot}/.env`);
}
