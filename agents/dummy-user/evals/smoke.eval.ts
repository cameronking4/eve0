import { defineEval } from "eve/evals";

export default defineEval({
  description: "Smoke test for dummy_user_agent",
  async test(t) {
    await t.send("How effectively does the agent manage user-related tasks with appropriate approval gating and efficient operation?");
    t.completed();
    t.calledTool("fetch_user_data");
    t.calledTool("update_user_profile");
    t.calledTool("delete_user_account");
  },
});
