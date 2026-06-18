import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";

export type WatchCallback = (changedPath: string) => void;

export function watchProject(
  projectRoot: string,
  onChange: WatchCallback,
  debounceMs = 300,
): FSWatcher {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watcher = chokidar.watch(
    [`${projectRoot}/agent`, `${projectRoot}/evals`],
    { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 150 } },
  );

  const notify = (path: string) => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(path), debounceMs);
  };

  watcher.on("add", notify).on("change", notify).on("unlink", notify);
  return watcher;
}
