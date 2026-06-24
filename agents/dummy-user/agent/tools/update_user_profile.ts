import { defineTool } from "eve/tools";
import { z } from "zod";
import { always } from "eve/tools/approval";

export default defineTool({
  description: "Update a user's profile information in the database",
  inputSchema: z.object({
    user_id: z.string().describe("The ID of the user to update"),
    profile_data: z.string().describe("A JSON string of the user's profile updates"),
  }),
  needsApproval: always(),
  async execute({ user_id, profile_data }) {
await database.updateUserProfile(user_id, JSON.parse(profile_data));
  },
});
