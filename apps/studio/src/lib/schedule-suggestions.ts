export type ScheduleSuggestion = {
  id: string;
  title: string;
  description: string;
  cron: string;
  cronLabel: string;
  prompt: string;
  rationale?: string;
};
