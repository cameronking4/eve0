import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { scaffoldPlanSchema, type ScaffoldPlan } from "./plan.js";
import { offlinePlanFromPrompt, planFromPrompt } from "./examples.js";

export type PlanSource = "example" | "offline" | "llm";

export interface PlanResult {
  plan: ScaffoldPlan;
  source: PlanSource;
}

export async function createPlanFromNL(
  prompt: string,
  options?: { model?: string },
): Promise<PlanResult> {
  const example = planFromPrompt(prompt);
  if (example) {
    return { plan: example, source: "example" };
  }

  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    return { plan: offlinePlanFromPrompt(prompt), source: "offline" };
  }

  const { object } = await generateObject({
    model: openai(options?.model ?? "gpt-4o"),
    schema: scaffoldPlanSchema,
    prompt: `You are an Eve agent architect. Generate a complete agent plan for this request.

Use snake_case tool filenames. Gate destructive tools with needsApproval: true.
Include at least one skill if the agent has domain procedures.
Include channels and schedules when the user mentions Slack, cron, or monitoring.

User request:
${prompt}`,
  });

  return { plan: scaffoldPlanSchema.parse(object), source: "llm" };
}
