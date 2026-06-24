import { defineEval } from "eve/evals";

export default defineEval({
  description: "Smoke test for example_agent",
  async test(t) {
    await t.send("Evaluate the effectiveness of the agent in accomplishing the described tasks efficiently.");
    t.completed();
  },
});
