import { defineTool } from "eve/tools";
import { z } from "zod";
import { always } from "eve/tools/approval";

export default defineTool({
  description: "Trigger a Plaid transaction sync for an item",
  inputSchema: z.object({
    itemId: z.string(),
  }),
  needsApproval: always(),
  async execute({ itemId }) {
    return { synced: true, itemId };
  },
});
