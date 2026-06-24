import { defineEval } from "eve/evals";

export default defineEval({
  description: "Smoke test for personal-finance-coach-and-advisor-constantly-sc",
  async test(t) {
    await t.send("What did I spend on groceries in the last two weeks?");
    t.completed();
    t.calledTool("plaid-accounts");
    t.calledTool("plaid-transactions");
    t.calledTool("plaid-sync");
  },
});
