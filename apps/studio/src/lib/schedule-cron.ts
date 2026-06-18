export type CronFrequency = "hourly" | "daily" | "weekdays" | "weekly" | "monthly" | "custom";

export type CronBuilderState = {
  frequency: CronFrequency;
  minute: number;
  hour: number;
  daysOfWeek: number[];
  dayOfMonth: number;
};

export const CRON_WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

export const CRON_SHORTCUTS: Array<{ label: string; cron: string }> = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every 5 min", cron: "*/5 * * * *" },
  { label: "Daily 9:00 UTC", cron: "0 9 * * *" },
  { label: "Weekdays 8:00 UTC", cron: "0 8 * * 1-5" },
  { label: "Weekly Mon 9:00 UTC", cron: "0 9 * * 1" },
  { label: "Monthly 1st 0:00 UTC", cron: "0 0 1 * *" },
];

export function defaultCronBuilderState(): CronBuilderState {
  return {
    frequency: "daily",
    minute: 0,
    hour: 9,
    daysOfWeek: [1],
    dayOfMonth: 1,
  };
}

export function cronFromBuilder(state: CronBuilderState): string {
  const { minute, hour, frequency, daysOfWeek, dayOfMonth } = state;
  switch (frequency) {
    case "hourly":
      return `${minute} * * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "weekly": {
      const dow = daysOfWeek.length > 0 ? [...daysOfWeek].sort((a, b) => a - b).join(",") : "1";
      return `${minute} ${hour} * * ${dow}`;
    }
    case "monthly":
      return `${minute} ${hour} ${dayOfMonth} * *`;
    default:
      return "";
  }
}

export function parseCronToBuilder(cron: string): CronBuilderState | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [min, hour, dom, month, dow] = parts;
  if (month !== "*") return null;

  const minute = min === "*" ? 0 : Number(min);
  const hourNum = hour === "*" ? 0 : Number(hour);
  if (Number.isNaN(minute) || Number.isNaN(hourNum)) return null;

  if (min.startsWith("*/") || hour.startsWith("*/") || dom !== "*") {
    if (dom !== "*" && dow === "*") {
      const dayOfMonth = Number(dom);
      if (!Number.isNaN(dayOfMonth)) {
        return { frequency: "monthly", minute, hour: hourNum, daysOfWeek: [1], dayOfMonth };
      }
    }
    return null;
  }

  if (hour === "*" && dom === "*" && dow === "*") {
    return { frequency: "hourly", minute, hour: 0, daysOfWeek: [1], dayOfMonth: 1 };
  }

  if (dom === "*" && dow === "1-5") {
    return { frequency: "weekdays", minute, hour: hourNum, daysOfWeek: [1, 2, 3, 4, 5], dayOfMonth: 1 };
  }

  if (dom === "*" && dow === "*") {
    return { frequency: "daily", minute, hour: hourNum, daysOfWeek: [1], dayOfMonth: 1 };
  }

  if (dom === "*" && dow !== "*") {
    const days = dow.split(",").map((d) => Number(d.trim())).filter((d) => !Number.isNaN(d));
    if (days.length > 0) {
      return { frequency: "weekly", minute, hour: hourNum, daysOfWeek: days, dayOfMonth: 1 };
    }
  }

  return null;
}

export function describeCronExpression(cron: string): string {
  const state = parseCronToBuilder(cron);
  if (!state) return cron;

  const time = `${String(state.hour).padStart(2, "0")}:${String(state.minute).padStart(2, "0")} UTC`;

  switch (state.frequency) {
    case "hourly":
      return state.minute === 0
        ? "Every hour on the hour"
        : `Every hour at minute ${state.minute}`;
    case "daily":
      return `Every day at ${time}`;
    case "weekdays":
      return `Weekdays at ${time}`;
    case "weekly": {
      const names = state.daysOfWeek
        .map((d) => CRON_WEEKDAYS.find((w) => w.value === d)?.label ?? String(d))
        .join(", ");
      return `Every ${names} at ${time}`;
    }
    case "monthly":
      return `Day ${state.dayOfMonth} of each month at ${time}`;
    default:
      return cron;
  }
}

export function padTime(value: number): string {
  return String(Math.min(59, Math.max(0, value))).padStart(2, "0");
}
