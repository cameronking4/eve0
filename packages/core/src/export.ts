import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExportResult, ForgeProject } from "./types.js";
import { generateReadme, generateSecurityDoc } from "./writers/readme.js";

async function copyDir(src: string, dest: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const files: string[] = [];
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await copyDir(srcPath, destPath)));
    } else {
      await cp(srcPath, destPath);
      files.push(destPath);
    }
  }
  return files;
}

export async function exportProject(
  project: ForgeProject,
  outputPath: string,
): Promise<ExportResult> {
  const resolved = outputPath.startsWith("~")
    ? join(process.env.HOME ?? "", outputPath.slice(1))
    : outputPath;

  await mkdir(resolved, { recursive: true });
  const files: string[] = [];

  files.push(...(await copyDir(project.agentDir, join(resolved, "agent"))));

  try {
    const { stat } = await import("node:fs/promises");
    await stat(project.evalsDir);
    files.push(...(await copyDir(project.evalsDir, join(resolved, "evals"))));
  } catch {
    // no evals
  }

  const envExample = join(project.root, ".env.example");
  try {
    const env = await readFile(envExample, "utf-8");
    const out = join(resolved, ".env.example");
    await writeFile(out, env, "utf-8");
    files.push(out);
  } catch {
    const out = join(resolved, ".env.example");
    await writeFile(out, "# Required environment variables\n", "utf-8");
    files.push(out);
  }

  const projectName = project.manifest.name ?? "eve-agent";
  const readme = join(resolved, "README.md");
  await writeFile(readme, generateReadme(project.manifest, projectName), "utf-8");
  files.push(readme);

  const security = join(resolved, "SECURITY.md");
  await writeFile(security, generateSecurityDoc(project.manifest), "utf-8");
  files.push(security);

  return { outputPath: resolved, files };
}
