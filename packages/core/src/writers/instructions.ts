import { writeProjectFile } from "../tree.js";

export async function writeInstructions(
  projectRoot: string,
  content: string,
): Promise<void> {
  await writeProjectFile(projectRoot, "agent/instructions.md", content);
}

export async function extractSkillFromInstructions(
  projectRoot: string,
  selection: string,
  slug: string,
  description: string,
): Promise<void> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { writeSkill } = await import("./skill.js");

  const instructionsPath = join(projectRoot, "agent/instructions.md");
  const instructions = await readFile(instructionsPath, "utf-8");
  if (!instructions.includes(selection)) {
    throw new Error("Selected text not found in instructions.md");
  }

  await writeSkill(projectRoot, { slug, description, body: selection.trim() });
  await writeInstructions(projectRoot, instructions.replace(selection, "").replace(/\n{3,}/g, "\n\n").trim() + "\n");
}
