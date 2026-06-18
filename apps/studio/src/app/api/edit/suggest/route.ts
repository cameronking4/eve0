import { getProjectRoot } from "@/lib/config";
import { loadProjectEnv } from "@forge/core";
import { NextResponse } from "next/server";

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[\w]*\n([\s\S]*?)\n```$/);
  return match ? match[1] : trimmed;
}

async function completeEdit(
  apiKey: string,
  system: string,
  user: string,
): Promise<string> {
  const useGateway = Boolean(process.env.AI_GATEWAY_API_KEY);
  const baseUrl = useGateway
    ? "https://ai-gateway.vercel.sh/v1"
    : "https://api.openai.com/v1";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.FORGE_EDIT_MODEL ?? "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Model request failed (${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Model returned empty content");
  return content;
}

export async function POST(request: Request) {
  try {
    const projectRoot = await getProjectRoot();
    loadProjectEnv(projectRoot);

    const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Set OPENAI_API_KEY or AI_GATEWAY_API_KEY in the agent project's .env.local" },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      path?: string;
      content?: string;
      instruction?: string;
    };

    const { path = "file", content = "", instruction = "" } = body;
    if (!instruction.trim()) {
      return NextResponse.json({ error: "instruction is required" }, { status: 400 });
    }

    const text = await completeEdit(
      apiKey,
      `You are a precise code editor for an Eve agent project.
Return ONLY the full updated file contents.
Do not wrap the answer in markdown code fences.
Preserve formatting, imports, and conventions unless the user asks to change them.`,
      `File path: ${path}

Current file:
${content}

User instruction:
${instruction}`,
    );

    return NextResponse.json({
      proposedContent: stripCodeFences(text),
      summary: instruction.trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
