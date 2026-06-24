import { defineEval } from "eve/evals";

export default defineEval({
  description: "Smoke test for foodie_agent_les",
  async test(t) {
    await t.send("How well does this agent understand and fulfill the user's request for local dining recommendations in LES?");
    t.completed();
    t.calledTool("get_restaurant_recommendations");
    t.calledTool("get_event_recommendations");
  },
});
