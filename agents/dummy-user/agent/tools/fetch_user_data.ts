import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Fetch user data from the database",
  inputSchema: z.object({
    user_id: z.string().describe("The ID of the user to fetch"),
  }),
  async execute({ user_id }) {
return await database.fetchUserById(user_id);
  },
});
