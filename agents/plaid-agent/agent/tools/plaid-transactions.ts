import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Fetch transactions for a Plaid account over a date range",
  inputSchema: z.object({
    accountId: z.string(),
    startDate: z.string().describe("YYYY-MM-DD"),
    endDate: z.string().describe("YYYY-MM-DD"),
  }),
  async execute({ accountId, startDate, endDate }) {
    // TODO: Plaid /transactions/get
    return { transactions: [], accountId, startDate, endDate };
  },
});
