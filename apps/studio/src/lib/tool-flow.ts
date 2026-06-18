export type ToolFieldType = "string" | "number" | "boolean";

export interface ToolFlowField {
  id: string;
  name: string;
  type: ToolFieldType;
  description?: string;
}

export interface ToolFlowModel {
  name: string;
  description: string;
  needsApproval: boolean;
  inputs: ToolFlowField[];
  /** Natural-language description of execute() behavior */
  logicPrompt: string;
  implementation: string;
}

export function createEmptyFlow(name = "my_tool"): ToolFlowModel {
  return {
    name,
    description: `Tool ${name}`,
    needsApproval: false,
    inputs: [{ id: "1", name: "input", type: "string", description: "Primary input" }],
    logicPrompt: "Return a success object confirming the action completed.",
    implementation: "    return { ok: true };",
  };
}

export function mergeFlowPatch(
  base: ToolFlowModel,
  patch: Partial<ToolFlowModel> & { inputs?: Array<Partial<ToolFlowField> & { name: string }> },
): ToolFlowModel {
  const next = { ...base, ...patch };
  if (patch.inputs) {
    next.inputs = patch.inputs.map((f, i) => ({
      id: f.id ?? String(i + 1),
      name: f.name,
      type: (f.type ?? "string") as ToolFieldType,
      description: f.description,
    }));
  }
  return next;
}

export function reorderFlowInputs(model: ToolFlowModel, fromId: string, toId: string): ToolFlowModel {
  if (fromId === toId) return model;
  const inputs = [...model.inputs];
  const fromIdx = inputs.findIndex((f) => f.id === fromId);
  const toIdx = inputs.findIndex((f) => f.id === toId);
  if (fromIdx < 0 || toIdx < 0) return model;
  const [moved] = inputs.splice(fromIdx, 1);
  inputs.splice(toIdx, 0, moved);
  return { ...model, inputs };
}

function zodField(type: ToolFieldType): string {
  switch (type) {
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    default:
      return "z.string()";
  }
}

export function flowToToolSource(model: ToolFlowModel): string {
  const lines: string[] = [
    'import { defineTool } from "eve/tools";',
    'import { z } from "zod";',
  ];

  if (model.needsApproval) {
    lines.push('import { always } from "eve/tools/approval";');
  }

  lines.push("", "export default defineTool({");
  lines.push(`  description: ${JSON.stringify(model.description)},`);

  if (model.inputs.length === 0) {
    lines.push("  inputSchema: z.object({}),");
  } else {
    lines.push("  inputSchema: z.object({");
    for (const f of model.inputs) {
      const desc = f.description ? `.describe(${JSON.stringify(f.description)})` : "";
      lines.push(`    ${f.name}: ${zodField(f.type)}${desc},`);
    }
    lines.push("  }),");
  }

  if (model.needsApproval) {
    lines.push("  needsApproval: always(),");
  }

  const params =
    model.inputs.length === 0 ? "" : `{ ${model.inputs.map((f) => f.name).join(", ")} }`;

  lines.push(`  async execute(${params}) {`);

  const impl = model.implementation.trim();
  if (impl) {
    const body =
      impl.startsWith("return") && !impl.includes("\n")
        ? `    ${impl}`
        : impl;
    for (const line of body.split("\n")) {
      lines.push(line);
    }
  }

  lines.push("  },", "});", "");
  return lines.join("\n");
}

/** Best-effort parse of scaffolded Eve tools into a flow model */
export function parseToolSource(source: string, fallbackName: string): ToolFlowModel | null {
  const descMatch = source.match(/description:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/);
  const description = descMatch
    ? JSON.parse(descMatch[1].replace(/^`|`$/g, '"').replace(/^'|'$/g, '"'))
    : fallbackName;

  const needsApproval = source.includes("needsApproval");

  const inputs: ToolFlowField[] = [];
  const fieldRe = /(\w+):\s*z\.(string|number|boolean)\(\)(?:\.describe\(([^)]+)\))?/g;
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(source)) !== null) {
    inputs.push({
      id: m[1],
      name: m[1],
      type: m[2] as ToolFieldType,
      description: m[3] ? JSON.parse(m[3]) : undefined,
    });
  }

  const executeMatch = source.match(/async execute\([^)]*\)\s*\{([\s\S]*?)\n  \},/);
  const implementation = executeMatch ? executeMatch[1] : "    return { ok: true };";

  const nameMatch = source.match(/agent\/tools\/([\w-]+)\.ts/);
  const name = fallbackName || nameMatch?.[1] || "my_tool";

  return {
    name,
    description,
    needsApproval,
    inputs: inputs.length ? inputs : [{ id: "1", name: "input", type: "string" }],
    logicPrompt: description,
    implementation,
  };
}

export function toolFilePath(name: string): string {
  return `agent/tools/${name}.ts`;
}
