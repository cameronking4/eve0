import { readStagedScaffoldSession, type ScaffoldSession } from "@forge/core";

// Survive Next dev HMR by stashing the registry on globalThis.
const globalRef = globalThis as unknown as {
  __forgeScaffoldSessions?: Map<string, ScaffoldSession>;
  __forgeScaffoldRunning?: Set<string>;
};
const sessions: Map<string, ScaffoldSession> =
  globalRef.__forgeScaffoldSessions ?? (globalRef.__forgeScaffoldSessions = new Map());
const running: Set<string> =
  globalRef.__forgeScaffoldRunning ?? (globalRef.__forgeScaffoldRunning = new Set());

/** M-A3 / M-UX5: only one active scaffold run per session id. */
export function tryStartRun(id: string): boolean {
  if (running.has(id)) return false;
  running.add(id);
  return true;
}

export function endRun(id: string): void {
  running.delete(id);
}

export function putScaffoldSession(session: ScaffoldSession): void {
  sessions.set(session.id, session);
}

export function getScaffoldSessionFromMemory(id: string): ScaffoldSession | undefined {
  return sessions.get(id);
}

/** Memory first (live during a run), then the id-keyed staged copy on disk. */
export async function resolveScaffoldSession(id: string): Promise<ScaffoldSession | null> {
  return sessions.get(id) ?? (await readStagedScaffoldSession(id));
}
