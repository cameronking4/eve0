import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Sends a notification to a specified channel with a message.",
  inputSchema: z.object({
    channel_id: z.string().describe("The ID of the channel to send the notification to."),
    message: z.string().describe("The message to be sent."),
  }),
  async execute({ channel_id, message }) {
return { notification_sent: true };
  },
});
