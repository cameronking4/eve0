import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Monitors the performance of a system and sends an alert if thresholds are exceeded.",
  inputSchema: z.object({
    system_id: z.string().describe("The ID of the system to monitor."),
    threshold: z.number().describe("The threshold value for performance."),
  }),
  async execute({ system_id, threshold }) {
return { performance_ok: true };
  },
});
