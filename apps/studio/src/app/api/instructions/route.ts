import { getProjectRoot } from "@/lib/config";
import {
  extractSkillFromInstructions,
  listSkills,
  readProjectFile,
  stageProjectFile,
  writeInstructions,
  writeSkill,
  deleteSkill,
} from "@forge/core";
import { NextResponse } from "next/server";

function skillPath(slug: string): string {
  return `agent/skills/${slug}.md`;
}

export async function GET() {
  try {
    const root = await getProjectRoot();
    const skills = await listSkills(root);
    const instructions = await readProjectFile(root, "agent/instructions.md").catch(
      () => "",
    );
    return NextResponse.json({ instructions, skills });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { instructions?: string };
  try {
    const root = await getProjectRoot();
    if (body.instructions !== undefined) {
      await writeInstructions(root, body.instructions);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as
    | { action: "create"; slug: string; description: string; body: string }
    | { action: "extract"; selection: string; slug: string; description: string };

  try {
    const root = await getProjectRoot();
    if (body.action === "create") {
      await writeSkill(root, {
        slug: body.slug,
        description: body.description,
        body: body.body,
      });
      const path = skillPath(body.slug);
      const content = await readProjectFile(root, path);
      await stageProjectFile(root, path, content);
    } else if (body.action === "extract") {
      await extractSkillFromInstructions(
        root,
        body.selection,
        body.slug,
        body.description,
      );
      const path = skillPath(body.slug);
      const content = await readProjectFile(root, path);
      await stageProjectFile(root, path, content);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  try {
    const root = await getProjectRoot();
    await deleteSkill(root, slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
