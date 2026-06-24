import { defineTool } from "eve/tools";
import { z } from "zod";
import { always } from "eve/tools/approval";

export default defineTool({
  description: "Deletes a specified file from the system.",
  inputSchema: z.object({
    file_path: z.string().describe("The path of the file to delete."),
  }),
  needsApproval: always(),
  async execute({ file_path }) {
return { file_deleted: true };
  },
});
