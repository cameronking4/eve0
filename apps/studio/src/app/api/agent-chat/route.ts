import { getProjectRoot } from "@/lib/config";
import { buildAgentContext, buildAgentSystemPrompt } from "@/lib/agent-context";
import { getAiApiKey } from "@/lib/ai-complete";
import { loadProjectEnv } from "@forge/core";
import { NextResponse } from "next/server";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function useGateway() {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

export async function POST(request: Request) {
  let projectRoot: string;
  try {
    projectRoot = await getProjectRoot();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }

  loadProjectEnv(projectRoot);
  const apiKey = getAiApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Set OPENAI_API_KEY or AI_GATEWAY_API_KEY in the agent project's .env.local" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    messages?: ChatMessage[];
    agentName?: string;
  };
  const messages = (body.messages ?? []).filter(
    (m) => (m.role === "user" || m.role === "assistant") && m.content.trim(),
  );
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  let systemPrompt: string;
  try {
    const context = await buildAgentContext(projectRoot);
    systemPrompt = buildAgentSystemPrompt(context, body.agentName);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }

  const baseUrl = useGateway()
    ? "https://ai-gateway.vercel.sh/v1"
    : "https://api.openai.com/v1";

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.FORGE_EDIT_MODEL ?? "gpt-4o",
      stream: true,
      temperature: 0.3,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    return NextResponse.json(
      { error: text || `Model request failed (${upstream.status})` },
      { status: 502 },
    );
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const json = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // skip non-JSON keepalive lines
            }
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
