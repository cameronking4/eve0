import { z } from "zod";

export const scaffoldPlanSchema = z.object({
  name: z.string(),
  model: z.string().default("openai/gpt-5.4-mini"),
  instructions: z.string(),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      inputFields: z.array(
        z.object({
          name: z.string(),
          type: z.enum(["string", "number", "boolean"]),
          description: z.string().optional(),
        }),
      ),
      needsApproval: z.boolean().optional(),
      implementation: z.string().optional(),
    }),
  ),
  skills: z.array(
    z.object({
      slug: z.string(),
      description: z.string(),
      body: z.string(),
    }),
  ),
  channels: z.array(
    z.object({
      kind: z.enum(["slack", "http"]),
      id: z.string(),
    }),
  ),
  schedules: z.array(
    z.object({
      id: z.string(),
      cron: z.string(),
      message: z.string(),
      channelId: z.string().optional(),
    }),
  ),
  envVars: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
    }),
  ),
  evalPrompt: z.string().optional(),
});

export type ScaffoldPlan = z.infer<typeof scaffoldPlanSchema>;
