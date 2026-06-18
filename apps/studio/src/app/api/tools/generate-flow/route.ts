import { getProjectRoot } from "@/lib/config";
import { loadProjectEnv } from "@forge/core";
import { completeChat, getAiApiKey, stripCodeFences } from "@/lib/ai-complete";
import { flowToToolSource, mergeFlowPatch, type ToolFlowModel } from "@/lib/tool-flow";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const projectRoot = await getProjectRoot();
    loadProjectEnv(projectRoot);

    const apiKey = getAiApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Set OPENAI_API_KEY or AI_GATEWAY_API_KEY in the agent project's .env.local" },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      prompt?: string;
      model?: ToolFlowModel;
      mode?: "full" | "logic";
    };

    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const current = body.model;
    const mode = body.mode ?? "full";

    const system =
      mode === "logic"
        ? `You generate ONLY the execute() function body for an Eve agent tool (TypeScript).
Return JSON: { "implementation": "    return { ... };", "logicPrompt": "one sentence summary" }
Rules:
- implementation is the function body only (indented with 4 spaces), must include return
- use destructured input params that match the tool's input schema
- no imports, no defineTool wrapper
- use TODO comments for external API keys when needed`
        : `You design Eve agent tools as JSON for a visual flow editor.
Return ONLY valid JSON with this shape:
{
  "name": "snake_case_tool_name",
  "description": "short tool description for the model",
  "needsApproval": false,
  "logicPrompt": "plain English what execute does",
  "inputs": [{ "name": "field", "type": "string|number|boolean", "description": "..." }],
  "implementation": "    return { ok: true };"
}
Rules:
- name must be valid snake_case or kebab-case identifier
- implementation is execute() body only (4-space indent, must return)
- inputs array can be empty for no-arg tools
- set needsApproval true for write/send/delete/post actions`;

    const user =
      mode === "logic" && current
        ? `Tool: ${current.name}
Description: ${current.description}
Inputs: ${JSON.stringify(current.inputs, null, 2)}

Current logic: ${current.logicPrompt}
Current implementation:
${current.implementation}

User request: ${body.prompt}`
        : current
          ? `Current tool draft:
${JSON.stringify(
  {
    name: current.name,
    description: current.description,
    needsApproval: current.needsApproval,
    logicPrompt: current.logicPrompt,
    inputs: current.inputs,
    implementation: current.implementation,
  },
  null,
  2,
)}

User request: ${body.prompt}`
          : `User request: ${body.prompt}`;

    const text = await completeChat(apiKey, system, user);
    const parsed = JSON.parse(stripCodeFences(text)) as Partial<ToolFlowModel> & {
      inputs?: Array<{ name: string; type?: string; description?: string }>;
    };

    const merged = current
      ? mergeFlowPatch(current, {
          ...parsed,
          inputs: parsed.inputs?.map((f, i) => ({
            id: String(i + 1),
            name: f.name,
            type: (f.type ?? "string") as "string" | "number" | "boolean",
            description: f.description,
          })),
        })
      : mergeFlowPatch(
          {
            name: "my_tool",
            description: "Generated tool",
            needsApproval: false,
            inputs: [],
            logicPrompt: body.prompt,
            implementation: "    return { ok: true };",
          },
          {
            ...parsed,
            inputs: parsed.inputs?.map((f, i) => ({
              id: String(i + 1),
              name: f.name,
              type: (f.type ?? "string") as "string" | "number" | "boolean",
              description: f.description,
            })),
          },
        );

    return NextResponse.json({
      model: merged,
      source: flowToToolSource(merged),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
