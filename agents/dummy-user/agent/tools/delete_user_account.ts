import { defineTool } from "eve/tools";
import { z } from "zod";
import { always } from "eve/tools/approval";

export default defineTool({
  description: "Delete a user's account permanently",
  inputSchema: z.object({
    user_id: z.string().describe("The ID of the user to delete"),
  }),
  needsApproval: always(),
  async execute({ user_id }) {
await database.deleteUserAccount(user_id);
  },
});
