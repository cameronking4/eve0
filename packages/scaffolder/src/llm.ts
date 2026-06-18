import { generateObject, jsonSchema, type LanguageModelV1 } from "ai";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { z } from "zod";
import { scaffoldPlanSchema, type ScaffoldPlan } from "./plan.js";
import { offlinePlanFromPrompt, planFromPrompt } from "./examples.js";

export type PlanSource = "example" | "offline" | "llm";

export interface PlanResult {
  plan: ScaffoldPlan;
  source: PlanSource;
}

const AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_MODEL = "gpt-4o";

// The repo pins zod 4 (root pnpm override), but ai@4 expects zod 3 for schema
// conversion. Convert with zod 4's native exporter and feed the AI SDK a raw
// JSON Schema so structured outputs work through the AI Gateway.
const PLAN_JSON_SCHEMA = jsonSchema<ScaffoldPlan>(
  z.toJSONSchema(scaffoldPlanSchema) as Record<string, unknown>,
);

/**
 * Resolve the planner LLM:
 *   1. OPENAI_API_KEY → OpenAI directly
 *   2. AI_GATEWAY_API_KEY → Vercel AI Gateway (OpenAI-compatible endpoint)
 *   3. neither → null (caller uses the deterministic offline plan)
 */
export function getPlannerModel(modelId?: string): LanguageModelV1 | null {
  // OpenAI strict structured outputs reject optional fields (our plan schema has
  // some), so use JSON mode — the AI SDK validates the result client-side.
  const settings = { structuredOutputs: false } as const;
  if (process.env.OPENAI_API_KEY) {
    return openai(modelId ?? DEFAULT_MODEL, settings);
  }
  if (process.env.AI_GATEWAY_API_KEY) {
    const gateway = createOpenAI({
      baseURL: AI_GATEWAY_URL,
      apiKey: process.env.AI_GATEWAY_API_KEY,
    });
    // Gateway model ids are provider-prefixed (e.g. "openai/gpt-4o").
    const id = modelId ?? DEFAULT_MODEL;
    return gateway(id.includes("/") ? id : `openai/${id}`, settings);
  }
  return null;
}

/** Generate (and validate) a plan from a model + prompt. Throws on API/validation errors. */
export async function generatePlanObject(
  model: LanguageModelV1,
  prompt: string,
): Promise<ScaffoldPlan> {
  const { object } = await generateObject({ model, schema: PLAN_JSON_SCHEMA, prompt });
  return scaffoldPlanSchema.parse(object);
}

export async function createPlanFromNL(
  prompt: string,
  options?: { model?: string },
): Promise<PlanResult> {
  const example = planFromPrompt(prompt);
  if (example) {
    return { plan: example, source: "example" };
  }

  const model = getPlannerModel(options?.model);
  if (!model) {
    return { plan: offlinePlanFromPrompt(prompt), source: "offline" };
  }

  try {
    const plan = await generatePlanObject(
      model,
      `You are an Eve agent architect. Generate a complete agent plan for this request.

Use snake_case tool filenames. Gate destructive tools with needsApproval: true.
Include at least one skill if the agent has domain procedures.
Include channels and schedules when the user mentions Slack, cron, or monitoring.
For each tool's "implementation", return ONLY a TypeScript function body (e.g. \`return { ok: true };\`) or omit it entirely. Never write prose or comments-only as the implementation.

User request:
${prompt}`,
    );
    return { plan, source: "llm" };
  } catch {
    // P6: graceful degradation — a failed LLM call falls back to the offline plan
    // rather than aborting the whole scaffold.
    return { plan: offlinePlanFromPrompt(prompt), source: "offline" };
  }
}
