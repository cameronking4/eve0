import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Fetches data based on the specified parameters.",
  inputSchema: z.object({
    query: z.string().describe("The query to fetch the data."),
  }),
  async execute({ query }) {
return { data_fetched: 'Data fetched successfully' };
  },
});
