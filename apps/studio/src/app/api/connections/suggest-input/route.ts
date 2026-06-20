import { getProjectRoot } from "@/lib/config";
import { jsonSchemaToInputFields, loadProjectEnv } from "@forge/core";
import { NextResponse } from "next/server";

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[\w]*\n([\s\S]*?)\n```$/);
  return match ? match[1] : trimmed;
}

async function completeJson(apiKey: string, system: string, user: string): Promise<string> {
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
      temperature: 0.2,
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
      connectionPath?: string;
      toolName?: string;
      inputSchema?: Record<string, unknown>;
    };

    if (!body.toolName) {
      return NextResponse.json({ error: "toolName required" }, { status: 400 });
    }

    const fields = jsonSchemaToInputFields(body.inputSchema ?? {});
    if (fields.length === 0) {
      return NextResponse.json({ input: {}, fields: [] });
    }

    const text = await completeJson(
      apiKey,
      `You generate realistic JSON tool inputs for Eve MCP connection debugging.
Return ONLY valid JSON — no markdown fences, no commentary.
Use plausible demo values (fake IDs, dates in ISO format, safe test strings).
Respect required vs optional fields.`,
      `Connection: ${body.connectionPath ?? "unknown"}
MCP tool: ${body.toolName}
Input schema:
${JSON.stringify(body.inputSchema ?? {}, null, 2)}`,
    );

    const input = JSON.parse(stripCodeFences(text)) as Record<string, unknown>;
    return NextResponse.json({ input, fields });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
