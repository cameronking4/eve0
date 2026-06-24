import { getProjectFileTree, readProjectFile, type FileTreeNode } from "@forge/core";

const MAX_FILE_BYTES = 16_000;
const MAX_TOTAL_BYTES = 120_000;

export interface AgentContextFile {
  path: string;
  content: string;
  truncated: boolean;
}

export interface AgentContext {
  treeText: string;
  files: AgentContextFile[];
}

function renderTree(nodes: FileTreeNode[], prefix = ""): string {
  const lines: string[] = [];
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const branch = isLast ? "└── " : "├── ";
    lines.push(`${prefix}${branch}${node.name}${node.type === "directory" ? "/" : ""}`);
    if (node.children && node.children.length > 0) {
      const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
      lines.push(renderTree(node.children, childPrefix));
    }
  });
  return lines.filter(Boolean).join("\n");
}

function collectFilePaths(nodes: FileTreeNode[], acc: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === "file") {
      acc.push(node.path);
    } else if (node.children) {
      collectFilePaths(node.children, acc);
    }
  }
  return acc;
}

/**
 * Reads the Eve agent directory structure (agent/ and evals/) and returns a
 * file tree plus the text contents, respecting per-file and total budgets so
 * the prompt stays within reasonable token limits.
 */
export async function buildAgentContext(root: string): Promise<AgentContext> {
  const tree = await getProjectFileTree(root);
  const treeText = renderTree(tree);
  const filePaths = collectFilePaths(tree);

  const files: AgentContextFile[] = [];
  let total = 0;

  for (const path of filePaths) {
    if (total >= MAX_TOTAL_BYTES) {
      files.push({ path, content: "(omitted — context budget reached)", truncated: true });
      continue;
    }
    try {
      let content = await readProjectFile(root, path);
      let truncated = false;
      if (content.length > MAX_FILE_BYTES) {
        content = `${content.slice(0, MAX_FILE_BYTES)}\n…(file truncated)`;
        truncated = true;
      }
      total += content.length;
      files.push({ path, content, truncated });
    } catch (error) {
      files.push({
        path,
        content: `(could not read file: ${error instanceof Error ? error.message : String(error)})`,
        truncated: false,
      });
    }
  }

  return { treeText, files };
}

export function buildAgentSystemPrompt(context: AgentContext, agentName?: string): string {
  const fileBlocks = context.files
    .map((file) => {
      const lang = file.path.split(".").pop() ?? "";
      return `### ${file.path}\n\`\`\`${lang}\n${file.content}\n\`\`\``;
    })
    .join("\n\n");

  return `You are Forge's AI agent editor. You help the user understand and plan changes to their Eve agent using natural language.

The user is working on the Eve agent${agentName ? ` named "${agentName}"` : ""}. An Eve agent is defined by files on disk: \`agent/agent.ts\` sets the model, \`agent/instructions.md\` is the system prompt, \`agent/tools/*.ts\` define tools, \`agent/skills/*.md\` define skills, \`agent/channels/*.ts\` configure channels, \`agent/schedules/*.ts\` define schedules, and \`evals/\` holds evaluations.

Below is the current directory structure and the full contents of the agent's files. Use them as ground truth when answering questions or proposing edits. When you propose changes, be specific about which files and lines would change and show concise code snippets. Do not invent files that are not present.

## Directory structure
\`\`\`
${context.treeText || "(no agent files found)"}
\`\`\`

## File contents
${fileBlocks || "(no readable files found)"}`;
}
