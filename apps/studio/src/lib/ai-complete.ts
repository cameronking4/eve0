const useGateway = () => Boolean(process.env.AI_GATEWAY_API_KEY);

export function getAiApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY ?? process.env.AI_GATEWAY_API_KEY;
}

export async function completeChat(
  apiKey: string,
  system: string,
  user: string,
  options?: { temperature?: number; model?: string },
): Promise<string> {
  const baseUrl = useGateway()
    ? "https://ai-gateway.vercel.sh/v1"
    : "https://api.openai.com/v1";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options?.model ?? process.env.FORGE_EDIT_MODEL ?? "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: options?.temperature ?? 0.2,
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

export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[\w]*\n([\s\S]*?)\n```$/);
  return match ? match[1] : trimmed;
}
