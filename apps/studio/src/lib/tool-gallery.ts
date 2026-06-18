export interface ToolGalleryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  needsApproval?: boolean;
  inputFields: Array<{ name: string; type: "string" | "number" | "boolean"; description?: string }>;
  implementation: string;
}

export const TOOL_GALLERY: ToolGalleryItem[] = [
  {
    id: "http-fetch",
    name: "http_fetch",
    description: "Fetch JSON from an HTTP GET endpoint",
    category: "Integrations",
    inputFields: [{ name: "url", type: "string", description: "URL to fetch" }],
    implementation: `    const res = await fetch(url);
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    return { data: await res.json() };`,
  },
  {
    id: "slack-notify",
    name: "slack_notify",
    description: "Post a message to Slack",
    category: "Integrations",
    needsApproval: true,
    inputFields: [
      { name: "message", type: "string" },
      { name: "channelId", type: "string", description: "Slack channel ID" },
    ],
    implementation: `    return { sent: true, channelId, message };`,
  },
  {
    id: "lookup-record",
    name: "lookup_record",
    description: "Look up a record by ID from your datastore",
    category: "Data",
    inputFields: [
      { name: "id", type: "string" },
      { name: "collection", type: "string" },
    ],
    implementation: `    return { id, collection, record: null };`,
  },
  {
    id: "run-query",
    name: "run_query",
    description: "Run a read-only SQL query",
    category: "Data",
    inputFields: [{ name: "sql", type: "string" }],
    implementation: `    return { rows: [], sql };`,
  },
];
