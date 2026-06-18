"use client";

import { useEffect, useState } from "react";
import {
  CRON_SHORTCUTS,
  CRON_WEEKDAYS,
  cronFromBuilder,
  defaultCronBuilderState,
  describeCronExpression,
  parseCronToBuilder,
  type CronBuilderState,
  type CronFrequency,
} from "@/lib/schedule-cron";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function CronScheduleBuilder({
  cron,
  onCronChange,
}: {
  cron: string;
  onCronChange: (cron: string) => void;
}) {
  const [builder, setBuilder] = useState<CronBuilderState>(
    () => parseCronToBuilder(cron) ?? defaultCronBuilderState(),
  );

  useEffect(() => {
    const parsed = parseCronToBuilder(cron);
    if (parsed) {
      setBuilder(parsed);
    } else if (cron.trim()) {
      setBuilder((b) => ({ ...b, frequency: "custom" }));
    }
  }, [cron]);

  const isCustom = builder.frequency === "custom";

  function updateBuilder(next: CronBuilderState) {
    setBuilder(next);
    if (next.frequency !== "custom") {
      onCronChange(cronFromBuilder(next));
    }
  }

  function applyShortcut(shortcutCron: string) {
    const next = parseCronToBuilder(shortcutCron);
    if (next) setBuilder(next);
    onCronChange(shortcutCron);
  }

  function onManualCronChange(value: string) {
    onCronChange(value);
    const next = parseCronToBuilder(value);
    if (next) setBuilder(next);
    else setBuilder((b) => ({ ...b, frequency: "custom" }));
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-medium">When to run (UTC)</Label>
        <Badge variant="secondary" className="font-normal">
          {describeCronExpression(cron)}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CRON_SHORTCUTS.map((shortcut) => (
          <Button
            key={shortcut.cron}
            type="button"
            size="sm"
            variant={cron === shortcut.cron ? "secondary" : "outline"}
            className="h-7 text-xs"
            onClick={() => applyShortcut(shortcut.cron)}
          >
            {shortcut.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Frequency</Label>
          <Select
            value={builder.frequency}
            onValueChange={(v) => {
              if (!v) return;
              const frequency = v as CronFrequency;
              if (frequency === "custom") {
                setBuilder((b) => ({ ...b, frequency: "custom" }));
                return;
              }
              updateBuilder({ ...builder, frequency });
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Every hour</SelectItem>
              <SelectItem value="daily">Every day</SelectItem>
              <SelectItem value="weekdays">Weekdays (Mon–Fri)</SelectItem>
              <SelectItem value="weekly">Specific days</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="custom">Custom cron</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!isCustom && builder.frequency !== "hourly" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Time (UTC)</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={23}
                value={builder.hour}
                className="h-9 font-mono"
                onChange={(e) =>
                  updateBuilder({ ...builder, hour: clamp(Number(e.target.value), 0, 23) })
                }
              />
              <span className="text-muted-foreground">:</span>
              <Input
                type="number"
                min={0}
                max={59}
                value={builder.minute}
                className="h-9 font-mono"
                onChange={(e) =>
                  updateBuilder({ ...builder, minute: clamp(Number(e.target.value), 0, 59) })
                }
              />
            </div>
          </div>
        )}

        {!isCustom && builder.frequency === "hourly" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">At minute</Label>
            <Input
              type="number"
              min={0}
              max={59}
              value={builder.minute}
              className="h-9 font-mono"
              onChange={(e) =>
                updateBuilder({ ...builder, minute: clamp(Number(e.target.value), 0, 59) })
              }
            />
          </div>
        )}

        {!isCustom && builder.frequency === "monthly" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Day of month</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={builder.dayOfMonth}
              className="h-9 font-mono"
              onChange={(e) =>
                updateBuilder({
                  ...builder,
                  dayOfMonth: clamp(Number(e.target.value), 1, 31),
                })
              }
            />
          </div>
        )}
      </div>

      {!isCustom && builder.frequency === "weekly" && (
        <div className="flex flex-wrap gap-1.5">
          {CRON_WEEKDAYS.map(({ value, label }) => {
            const selected = builder.daysOfWeek.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  const days = selected
                    ? builder.daysOfWeek.filter((d) => d !== value)
                    : [...builder.daysOfWeek, value];
                  updateBuilder({ ...builder, daysOfWeek: days.length ? days : [value] });
                }}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs transition-colors",
                  selected
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-transparent bg-background hover:bg-accent",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Cron expression</Label>
        <Input
          value={cron}
          onChange={(e) => onManualCronChange(e.target.value)}
          className="font-mono text-sm"
          placeholder="0 9 * * *"
        />
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}
