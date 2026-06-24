import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://nextjs-mcp-apps-chatbot.vercel.app/api/mcp/server/mcp",
  description: "test",
});
