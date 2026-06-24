# Connections

External integrations for this agent.

## Slack

Add the Slack channel after scaffolding:

```bash
npx eve channels add slack
```

Then configure credentials via Vercel Connect or `.env.local`.

## Schedules

Scheduled tasks are documented in the plan. Add a Slack channel first, then create
`agent/schedules/*.ts` using `defineSchedule` from `eve/schedules`.

- `SLACK_API_TOKEN` — API token for accessing Slack.