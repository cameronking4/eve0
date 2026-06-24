import { defineTool } from "eve/tools";
import { z } from "zod";
import { always } from "eve/tools/approval";

export default defineTool({
  description: "Creates a backup of the specified data.",
  inputSchema: z.object({
    data_id: z.string().describe("The ID of the data to backup."),
  }),
  needsApproval: always(),
  async execute({ data_id }) {
return { backup_created: true };
  },
});
