import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Generates a report based on the provided data.",
  inputSchema: z.object({
    data: z.string().describe("The input data for the report."),
  }),
  async execute({ data }) {
return { report: 'Report generated successfully' };
  },
});
