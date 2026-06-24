import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "List Plaid-linked accounts for the user",
  inputSchema: z.object({
    userId: z.string().describe("Internal user identifier"),
  }),
  async execute({ userId }) {
    // TODO: Plaid /accounts/get with process.env.PLAID_SECRET
    return { accounts: [], userId };
  },
});
