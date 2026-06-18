import type { ScaffoldPlan } from "./plan.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "my-agent";
}

/** Offline fallback: Stripe chargeback monitor from the Forge pitch */
export function stripeChargebackPlan(): ScaffoldPlan {
  return {
    name: "stripe-chargeback-monitor",
    model: "openai/gpt-5.4-mini",
    instructions: `You monitor Stripe chargebacks and disputes for the account.

## Responsibilities
- Poll for new disputes and chargebacks
- Flag chargebacks over $500 for immediate attention
- Send a Slack alert before taking any automated response action
- Compile evidence packages following team procedures

## Rules
- Never submit a dispute response without human approval
- Always load chargeback-triage skill before categorizing disputes
- State amounts in USD with two decimal places`,
    tools: [
      {
        name: "stripe-disputes",
        description: "Read open Stripe disputes and chargebacks",
        inputFields: [
          { name: "status", type: "string", description: "Filter by dispute status" },
          { name: "minAmount", type: "number", description: "Minimum amount in cents" },
        ],
        implementation: `    // TODO: wire to Stripe API with process.env.STRIPE_SECRET_KEY
    return { disputes: [], status, minAmount };`,
      },
      {
        name: "stripe-respond",
        description: "Submit a dispute response to Stripe",
        inputFields: [
          { name: "disputeId", type: "string" },
          { name: "evidence", type: "string", description: "Evidence summary" },
        ],
        needsApproval: true,
        implementation: `    return { submitted: true, disputeId };`,
      },
      {
        name: "slack-notify",
        description: "Post an alert message to Slack",
        inputFields: [
          { name: "message", type: "string" },
          { name: "channelId", type: "string", description: "Slack channel ID" },
        ],
        needsApproval: false,
        implementation: `    return { sent: true, channelId };`,
      },
    ],
    skills: [
      {
        slug: "chargeback-triage",
        description: "Decision tree for dispute types and severity",
        body: `## Chargeback triage

1. **Fraudulent** — gather AVS/CVV match, device fingerprint, prior successful charges
2. **Product not received** — pull tracking, delivery confirmation, customer comms
3. **Duplicate** — compare charge IDs and timestamps
4. **Over $500** — always alert Slack before any response`,
      },
      {
        slug: "evidence-builder",
        description: "How to compile evidence packages for Stripe disputes",
        body: `## Evidence package checklist

- Customer email and account history
- Receipt and invoice PDFs
- Shipping/tracking for physical goods
- Terms of service acceptance timestamp
- Prior successful payments from same card`,
      },
    ],
    channels: [{ kind: "slack", id: "slack" }],
    schedules: [],
    envVars: [
      { name: "STRIPE_SECRET_KEY", description: "Stripe API secret key" },
      { name: "SLACK_BOT_TOKEN", description: "Slack bot token for notifications" },
      { name: "SLACK_SIGNING_SECRET", description: "Slack signing secret" },
    ],
    evalPrompt:
      "A $750 chargeback was opened. Triage it and alert Slack before responding.",
  };
}

/** Offline fallback: Plaid financial data agent */
export function plaidAgentPlan(title = "Plaid Agent"): ScaffoldPlan {
  const name = slugify(title);
  return {
    name,
    model: "openai/gpt-5.4-mini",
    instructions: `You are a financial data assistant powered by Plaid.

## Responsibilities
- Help users understand balances and transactions from linked accounts
- Answer questions about spending patterns and account activity
- Never move money or initiate payments without explicit human approval

## Rules
- Scope every query to accounts the user has access to
- Load the plaid-workflow skill before answering transaction questions
- Redact full account numbers in replies; show only last four digits`,
    tools: [
      {
        name: "plaid-accounts",
        description: "List Plaid-linked accounts for the user",
        inputFields: [
          { name: "userId", type: "string", description: "Internal user identifier" },
        ],
        implementation: `    // TODO: Plaid /accounts/get with process.env.PLAID_SECRET
    return { accounts: [], userId };`,
      },
      {
        name: "plaid-transactions",
        description: "Fetch transactions for a Plaid account over a date range",
        inputFields: [
          { name: "accountId", type: "string" },
          { name: "startDate", type: "string", description: "YYYY-MM-DD" },
          { name: "endDate", type: "string", description: "YYYY-MM-DD" },
        ],
        implementation: `    // TODO: Plaid /transactions/get
    return { transactions: [], accountId, startDate, endDate };`,
      },
      {
        name: "plaid-sync",
        description: "Trigger a Plaid transaction sync for an item",
        inputFields: [{ name: "itemId", type: "string" }],
        needsApproval: true,
        implementation: `    return { synced: true, itemId };`,
      },
    ],
    skills: [
      {
        slug: "plaid-workflow",
        description: "How to query Plaid data safely and answer common money questions",
        body: `## Plaid workflow

1. Resolve the user's linked items before querying transactions
2. Default date range to last 30 days unless the user specifies otherwise
3. Summarize in plain language; include totals and notable merchants
4. For large or unusual transactions, call out amount and date explicitly`,
      },
    ],
    channels: [],
    schedules: [],
    envVars: [
      { name: "PLAID_CLIENT_ID", description: "Plaid client ID" },
      { name: "PLAID_SECRET", description: "Plaid secret (sandbox or production)" },
      { name: "PLAID_ENV", description: "sandbox | development | production" },
    ],
    evalPrompt: "What did I spend on groceries in the last two weeks?",
  };
}

/** Generic offline scaffold from any short title or description */
export function genericPlanFromPrompt(prompt: string): ScaffoldPlan {
  const name = slugify(prompt.split(/[.!?\n]/)[0] ?? prompt);
  const title = prompt.trim();

  return {
    name,
    model: "openai/gpt-5.4-mini",
    instructions: `You are ${title}.

## Responsibilities
- Help the user accomplish tasks related to your purpose
- Use available tools when you need structured actions or external data
- Be concise and state assumptions clearly

## Rules
- Ask clarifying questions when the request is ambiguous
- Prefer tools over guessing when data is required`,
    tools: [
      {
        name: "run_task",
        description: `Execute a task for ${title}`,
        inputFields: [
          { name: "task", type: "string", description: "What to do" },
          { name: "context", type: "string", description: "Optional extra context" },
        ],
        implementation: `    // TODO: implement ${name} task handler
    return { ok: true, task, context };`,
      },
    ],
    skills: [
      {
        slug: "workflow",
        description: `Standard operating procedure for ${title}`,
        body: `## Workflow

1. Understand what the user wants
2. Use tools when external data or actions are needed
3. Summarize results and next steps`,
      },
    ],
    channels: [],
    schedules: [],
    envVars: [
      { name: "AI_GATEWAY_API_KEY", description: "Model access via Vercel AI Gateway" },
    ],
    evalPrompt: `Hello — introduce yourself as ${title} and explain what you can help with.`,
  };
}

export function planFromPrompt(prompt: string): ScaffoldPlan | null {
  const lower = prompt.toLowerCase();

  if (
    lower.includes("stripe") &&
    (lower.includes("chargeback") || lower.includes("dispute"))
  ) {
    const plan = stripeChargebackPlan();
    if (lower.includes("500")) {
      plan.instructions = plan.instructions.replace(
        "over $500",
        "over $500 (threshold configurable in instructions)",
      );
    }
    return plan;
  }

  if (lower.includes("plaid")) {
    return plaidAgentPlan(prompt);
  }

  return null;
}

export function offlinePlanFromPrompt(prompt: string): ScaffoldPlan {
  return planFromPrompt(prompt) ?? genericPlanFromPrompt(prompt);
}
