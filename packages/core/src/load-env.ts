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

/** Env vars that grant model access for scaffolding (LLM plans) and preview/chat. */
export const MODEL_CREDENTIAL_VARS = [
  "AI_GATEWAY_API_KEY",
  "OPENAI_API_KEY",
  "VERCEL_OIDC_TOKEN",
] as const;

/**
 * True when at least one model-access credential is present in `process.env`.
 * Call after {@link loadProjectEnv} so project `.env.local` values are visible.
 */
export function hasModelCredentials(): boolean {
  return MODEL_CREDENTIAL_VARS.some((name) => Boolean(process.env[name]?.trim()));
}
