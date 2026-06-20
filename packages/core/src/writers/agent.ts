import { Project, SyntaxKind } from "ts-morph";
import { access } from "node:fs/promises";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stageProjectFile, stageProjectFileDeletion } from "../staging.js";
import { readProjectFile } from "../tree.js";
import type { ApprovalMode } from "../types.js";
import type { StagingManifest } from "../staging.js";

const AUTHORED_TOOL_PATH = /^agent\/tools\/[a-zA-Z][a-zA-Z0-9_]*\.ts$/;
const HARNESS_TOOL_NAMES = new Set([
  "bash",
  "read_file",
  "write_file",
  "grep",
  "glob",
  "list_dir",
]);

export function normalizeToolName(name: string): string {
  const normalized = name.trim().replace(/\W/g, "_").replace(/^_+|_+$/g, "");
  return normalized;
}

export function toolRelPath(name: string): string {
  return `agent/tools/${normalizeToolName(name)}.ts`;
}

function normalizeToolPath(sourcePath: string): string {
  return sourcePath.replace(/^\/+/, "");
}

async function projectPathExists(projectRoot: string, relPath: string): Promise<boolean> {
  try {
    await access(join(projectRoot, relPath));
    return true;
  } catch {
    return false;
  }
}

export async function stageToolDeletion(
  projectRoot: string,
  sourcePath: string,
): Promise<StagingManifest> {
  const normalized = normalizeToolPath(sourcePath);
  if (!AUTHORED_TOOL_PATH.test(normalized)) {
    throw new Error(`Not an authored tool file: ${sourcePath}`);
  }
  const name = normalized.replace(/^agent\/tools\//, "").replace(/\.ts$/, "");
  if (HARNESS_TOOL_NAMES.has(name)) {
    throw new Error(`Harness tool "${name}" cannot be deleted.`);
  }
  return stageProjectFileDeletion(projectRoot, normalized);
}

export async function renameAuthoredTool(
  projectRoot: string,
  sourcePath: string,
  newName: string,
): Promise<{ oldPath: string; newPath: string; name: string }> {
  const oldPath = normalizeToolPath(sourcePath);
  if (!AUTHORED_TOOL_PATH.test(oldPath)) {
    throw new Error(`Not an authored tool file: ${sourcePath}`);
  }

  const name = normalizeToolName(newName);
  if (!name) {
    throw new Error("Tool name is required");
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      "Tool name must start with a letter or underscore and use only letters, numbers, and underscores",
    );
  }
  if (HARNESS_TOOL_NAMES.has(name)) {
    throw new Error(`"${name}" is reserved for Eve harness tools`);
  }

  const newPath = toolRelPath(name);
  if (newPath === oldPath) {
    return { oldPath, newPath, name };
  }

  if (await projectPathExists(projectRoot, newPath)) {
    throw new Error(`Tool "${name}" already exists`);
  }

  const content = await readProjectFile(projectRoot, oldPath);
  await stageProjectFile(projectRoot, newPath, content);
  await stageProjectFileDeletion(projectRoot, oldPath);

  return { oldPath, newPath, name };
}

export async function readAgentModel(projectRoot: string): Promise<string | undefined> {
  const path = join(projectRoot, "agent/agent.ts");
  try {
    const source = await readFile(path, "utf-8");
    const match = source.match(/model:\s*["'`]([^"'`]+)["'`]/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export async function writeAgentModel(projectRoot: string, model: string): Promise<void> {
  const path = join(projectRoot, "agent/agent.ts");
  let source: string;
  try {
    source = await readFile(path, "utf-8");
  } catch {
    source = `import { defineAgent } from "eve";\n\nexport default defineAgent({\n  model: "${model}",\n});\n`;
    await writeFile(path, source, "utf-8");
    return;
  }

  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("agent.ts", source, { overwrite: true });
  const call = file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getText().includes("defineAgent"));

  if (!call) {
    throw new Error("Could not find defineAgent() in agent/agent.ts");
  }

  const arg = call.getArguments()[0];
  if (!arg || !arg.isKind(SyntaxKind.ObjectLiteralExpression)) {
    throw new Error("defineAgent() must receive an object literal");
  }

  const obj = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const modelProp = obj.getProperty("model");
  if (modelProp?.isKind(SyntaxKind.PropertyAssignment)) {
    modelProp.getInitializerOrThrow().replaceWithText(`"${model}"`);
  } else {
    obj.addPropertyAssignment({ name: "model", initializer: `"${model}"` });
  }

  await writeFile(path, file.getFullText(), "utf-8");
}

export async function readToolApprovalFromFile(
  filePath: string,
): Promise<{ needsApproval: boolean; approvalMode: ApprovalMode | "predicate" }> {
  try {
    const source = await readFile(filePath, "utf-8");
    if (!source.includes("needsApproval")) {
      return { needsApproval: false, approvalMode: "none" };
    }
    if (source.includes("always()")) return { needsApproval: true, approvalMode: "always" };
    if (source.includes("once()")) return { needsApproval: true, approvalMode: "once" };
    if (source.includes("never()")) return { needsApproval: false, approvalMode: "never" };
    return { needsApproval: true, approvalMode: "predicate" };
  } catch {
    return { needsApproval: false, approvalMode: "none" };
  }
}

export async function writeToolApproval(
  projectRoot: string,
  toolRelPath: string,
  mode: ApprovalMode,
): Promise<void> {
  const path = join(projectRoot, toolRelPath);
  const source = await readFile(path, "utf-8");
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("tool.ts", source, { overwrite: true });

  if (mode === "none") {
    file.getImportDeclarations().forEach((imp) => {
      if (imp.getModuleSpecifierValue().includes("eve/tools/approval")) {
        imp.remove();
      }
    });
    const obj = findDefineToolObject(file);
    if (obj) {
      const prop = obj.getProperty("needsApproval");
      prop?.remove();
    }
    await writeFile(path, file.getFullText(), "utf-8");
    return;
  }

  const helper = mode === "always" ? "always" : mode === "once" ? "once" : "never";
  const hasImport = file
    .getImportDeclarations()
    .some((i) => i.getModuleSpecifierValue() === "eve/tools/approval");

  if (!hasImport) {
    file.addImportDeclaration({
      moduleSpecifier: "eve/tools/approval",
      namedImports: [helper],
    });
  } else {
    const imp = file
      .getImportDeclarations()
      .find((i) => i.getModuleSpecifierValue() === "eve/tools/approval");
    if (imp && !imp.getNamedImports().some((n) => n.getName() === helper)) {
      imp.addNamedImport(helper);
    }
  }

  const obj = findDefineToolObject(file);
  if (!obj) throw new Error("Could not find defineTool() call");

  const existing = obj.getProperty("needsApproval");
  const initializer = `${helper}()`;
  if (existing?.isKind(SyntaxKind.PropertyAssignment)) {
    existing.getInitializerOrThrow().replaceWithText(initializer);
  } else {
    obj.addPropertyAssignment({ name: "needsApproval", initializer });
  }

  await writeFile(path, file.getFullText(), "utf-8");
}

function findDefineToolObject(file: import("ts-morph").SourceFile) {
  const call = file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getText().includes("defineTool"));
  const arg = call?.getArguments()[0];
  return arg?.isKind(SyntaxKind.ObjectLiteralExpression) ? arg : undefined;
}

export async function scaffoldTool(
  projectRoot: string,
  name: string,
  description: string,
  needsApproval = false,
): Promise<void> {
  const approvalImport = needsApproval
    ? `import { always } from "eve/tools/approval";\n`
    : "";
  const approvalField = needsApproval ? "\n  needsApproval: always()," : "";

  const content = `import { defineTool } from "eve/tools";
import { z } from "zod";
${approvalImport}
export default defineTool({
  description: ${JSON.stringify(description)},
  inputSchema: z.object({}),${approvalField}
  async execute() {
    return { ok: true };
  },
});
`;

  const { writeProjectFile } = await import("../tree.js");
  await writeProjectFile(projectRoot, toolRelPath(name), content);
}
