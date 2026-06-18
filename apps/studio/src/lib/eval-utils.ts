export function evalFilePath(id: string): string {
  const normalized = id.replace(/^evals\//, "").replace(/\.eval\.ts$/, "");
  return `evals/${normalized}.eval.ts`;
}

export function defaultEvalTemplate(id: string, description?: string): string {
  const desc = description ?? `Eval: ${id}`;
  return `import { defineEval } from "eve/evals";

export default defineEval({
  description: ${JSON.stringify(desc)},
  async test(t) {
    await t.send("Hello — replace with a realistic user message");
    t.completed();
  },
});
`;
}
