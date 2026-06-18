import matter from "gray-matter";
import { join } from "node:path";
import { writeProjectFile } from "../tree.js";
import type { SkillData } from "../types.js";

export async function readSkill(projectRoot: string, slug: string): Promise<SkillData> {
  const { readFile } = await import("node:fs/promises");
  const path = join(projectRoot, "agent/skills", `${slug}.md`);
  const raw = await readFile(path, "utf-8");
  const parsed = matter(raw);
  return {
    slug,
    description: String(parsed.data.description ?? ""),
    body: parsed.content.trim(),
  };
}

export async function writeSkill(projectRoot: string, skill: SkillData): Promise<void> {
  const content = matter.stringify(skill.body.trim() + "\n", {
    description: skill.description,
  });
  await writeProjectFile(projectRoot, `agent/skills/${skill.slug}.md`, content);
}

export async function deleteSkill(projectRoot: string, slug: string): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  await unlink(join(projectRoot, "agent/skills", `${slug}.md`));
}

export async function listSkills(projectRoot: string): Promise<SkillData[]> {
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = join(projectRoot, "agent/skills");
  try {
    const files = await readdir(dir);
    const skills: SkillData[] = [];
    for (const file of files.filter((f) => f.endsWith(".md"))) {
      const slug = file.replace(/\.md$/, "");
      const raw = await readFile(join(dir, file), "utf-8");
      const parsed = matter(raw);
      skills.push({
        slug,
        description: String(parsed.data.description ?? ""),
        body: parsed.content.trim(),
      });
    }
    return skills;
  } catch {
    return [];
  }
}
