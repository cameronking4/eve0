import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "generate jokes based on humor preferences",
  inputSchema: z.object({
    humor_type: z.string().describe("Type of humor preferred (e.g., dad joke, sarcastic, witty, black)."),
  }),
  async execute({ humor_type }) {
    const jokes = await generateJokes(humor_type);
    return { ok: true, jokes };
  },
});

async function generateJokes(humor_type) {
  // Simulate a call to an LLM or external API to fetch jokes
  // This is a placeholder implementation
  const exampleJokes = {
    "dad joke": ["Why don't skeletons fight each other? They don't have the guts."],
    "sarcastic": ["I'm not arguing. I'm just explaining why I'm right."],
    "witty": ["I was going to tell a time-traveling joke, but you didn't like it."],
    "black": ["I used to be a people's person, but people ruined that for me."]
  };
  
  return exampleJokes[humor_type] || ["No jokes available for this humor type."];
}