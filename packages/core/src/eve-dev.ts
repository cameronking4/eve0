import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

async function readPidFile(path: string): Promise<number | null> {
  if (!existsSync(path)) return null;
  const raw = (await readFile(path, "utf-8")).trim();
  const pid = Number.parseInt(raw, 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Stop a stale Eve dev worker so withEve() can boot a fresh one. */
export async function stopStaleEveDev(projectRoot: string): Promise<void> {
  const eveDir = join(projectRoot, ".eve");
  const pidPath = join(eveDir, "dev-process.pid");
  const pid = await readPidFile(pidPath);

  if (pid && isProcessRunning(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const staleMarkers = [
    join(eveDir, "dev-process.pid"),
    join(eveDir, "next-dev-server.json"),
  ];
  await Promise.all(
    staleMarkers.map(async (path) => {
      if (existsSync(path)) await rm(path, { force: true });
    }),
  );
}
