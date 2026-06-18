import type { ScaffoldPlan } from "./plan.js";

const DESTRUCTIVE = ["write", "send", "delete", "refund", "respond", "post", "update", "create"];

function needsApproval(description: string, explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  const lower = description.toLowerCase();
  return DESTRUCTIVE.some((k) => lower.includes(k));
}

function zodFieldType(type: string): string {
  switch (type) {
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    default:
      return "z.string()";
  }
}

export function generateAgentTs(model: string): string {
  return `import { defineAgent } from "eve";

export default defineAgent({
  model: ${JSON.stringify(model)},
});
`;
}

export function generateEveChannel(): string {
  return `import { eveChannel } from "eve/channels/eve";
import { localDev, placeholderAuth, vercelOidc } from "eve/channels/auth";

export default eveChannel({
  auth: [localDev(), vercelOidc(), placeholderAuth()],
});
`;
}

export function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        types: ["node"],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["agent/**/*.ts", "evals/**/*.ts", ".eve/**/*.d.ts"],
    },
    null,
    2,
  );
}

export function generateGitignore(): string {
  return `node_modules
.env*
.eve
.vercel
.workflow-data
.next
.output
.nitro
dist
.DS_Store
*.tsbuildinfo
`;
}

export function generateToolFile(tool: ScaffoldPlan["tools"][number]): string {
  const approval = needsApproval(tool.description, tool.needsApproval);
  const approvalImport = approval ? `import { always } from "eve/tools/approval";\n` : "";
  const approvalField = approval ? "\n  needsApproval: always()," : "";

  const fields =
    tool.inputFields.length === 0
      ? ""
      : tool.inputFields
          .map((f) => {
            const desc = f.description ? `.describe(${JSON.stringify(f.description)})` : "";
            return `    ${f.name}: ${zodFieldType(f.type)}${desc},`;
          })
          .join("\n");

  const inputSchema =
    tool.inputFields.length === 0
      ? "z.object({})"
      : `z.object({\n${fields}\n  })`;

  const params =
    tool.inputFields.length === 0
      ? ""
      : `{ ${tool.inputFields.map((f) => f.name).join(", ")} }`;

  const impl =
    tool.implementation ??
    `    return { ok: true${tool.inputFields.length ? `, ${tool.inputFields.map((f) => f.name).join(", ")}` : ""} };`;

  return `import { defineTool } from "eve/tools";
import { z } from "zod";
${approvalImport}
export default defineTool({
  description: ${JSON.stringify(tool.description)},
  inputSchema: ${inputSchema},${approvalField}
  async execute(${params}) {
${impl}
  },
});
`;
}

export function generateSkillFile(skill: ScaffoldPlan["skills"][number]): string {
  return `---
description: ${JSON.stringify(skill.description)}
---
${skill.body.trim()}
`;
}

export function generateEvalsConfig(): string {
  return `import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({});
`;
}

export function generateSmokeEval(plan: ScaffoldPlan): string {
  const prompt =
    plan.evalPrompt ??
    (plan.tools.length
      ? `Exercise the agent: ${plan.tools.map((t) => t.name).join(", ")}`
      : "Say hello and complete the task.");

  const toolChecks = plan.tools
    .map((t) => `    t.calledTool(${JSON.stringify(t.name)});`)
    .join("\n");

  return `import { defineEval } from "eve/evals";

export default defineEval({
  description: "Smoke test for ${plan.name}",
  async test(t) {
    await t.send(${JSON.stringify(prompt)});
    t.completed();
${toolChecks || "    // Add tool assertions as the agent matures"}
  },
});
`;
}

export function generateEnvExample(envVars: ScaffoldPlan["envVars"]): string {
  const lines = envVars.map((v) => `# ${v.description}\n${v.name}=\n`);
  return lines.join("\n") || "# Model access (pick one)\nAI_GATEWAY_API_KEY=\n";
}

export function generateConnectionsMd(plan: ScaffoldPlan): string {
  const lines = [
    "# Connections",
    "",
    "External integrations for this agent.",
    "",
  ];
  if (plan.channels.some((c) => c.kind === "slack")) {
    lines.push(
      "## Slack",
      "",
      "Add the Slack channel after scaffolding:",
      "",
      "```bash",
      "npx eve channels add slack",
      "```",
      "",
      "Then configure credentials via Vercel Connect or `.env.local`.",
      "",
    );
  }
  if (plan.schedules.length) {
    lines.push(
      "## Schedules",
      "",
      "Scheduled tasks are documented in the plan. Add a Slack channel first, then create",
      "`agent/schedules/*.ts` using `defineSchedule` from `eve/schedules`.",
      "",
    );
  }
  for (const v of plan.envVars) {
    lines.push(`- \`${v.name}\` — ${v.description}`);
  }
  return lines.join("\n");
}

export function generatePackageJson(name: string): string {
  return JSON.stringify(
    {
      name,
      version: "0.0.0",
      private: true,
      type: "module",
      imports: {
        "#*": "./agent/*",
        "#evals/*": "./evals/*",
      },
      scripts: {
        build: "eve build",
        dev: "eve dev",
        start: "eve start",
        eval: "eve eval",
      },
      dependencies: {
        ai: "7.0.0-beta.178",
        eve: "^0.11.4",
        zod: "^4.4.3",
      },
      devDependencies: {
        "@types/node": "^22.10.2",
        microsandbox: "^0.5.7",
      },
      engines: {
        node: ">=20",
      },
    },
    null,
    2,
  );
}
