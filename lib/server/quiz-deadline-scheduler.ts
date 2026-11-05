import "server-only";

import { processQuizDeadlineReminders } from "@/lib/server/data";

declare global {
  // eslint-disable-next-line no-var
  var __fwfQuizDeadlineSchedulerStarted__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __fwfQuizDeadlineLastRunKey__: string | undefined;
}

function getVietnamParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour") || "0"),
  };
}

function shouldEnableScheduler() {
  if (process.env.ENABLE_QUIZ_DEADLINE_CRON === "false") return false;
  if (process.env.ENABLE_QUIZ_DEADLINE_CRON === "true") return true;
  const provider = (process.env.DATA_PROVIDER ?? "").trim().toLowerCase();
  return provider === "railway" || provider === "postgres";
}

export function startQuizDeadlineReminderScheduler() {
  if (!shouldEnableScheduler()) return;
  if (globalThis.__fwfQuizDeadlineSchedulerStarted__) return;
  globalThis.__fwfQuizDeadlineSchedulerStarted__ = true;

  const targetHour = Math.min(Math.max(Number(process.env.QUIZ_REMINDER_HOUR_VN ?? "8") || 8, 0), 23);
  const intervalMs = Math.max(Number(process.env.QUIZ_REMINDER_CHECK_MS ?? String(15 * 60 * 1000)) || 15 * 60 * 1000, 60_000);

  const tick = async () => {
    const { dateKey, hour } = getVietnamParts();
    if (hour !== targetHour) return;
    const runKey = `${dateKey}@${targetHour}`;
    if (globalThis.__fwfQuizDeadlineLastRunKey__ === runKey) return;
    globalThis.__fwfQuizDeadlineLastRunKey__ = runKey;

    try {
      const result = await processQuizDeadlineReminders();
      console.info("[quiz-deadline-scheduler]", result);
    } catch (error) {
      console.error("[quiz-deadline-scheduler] failed", error);
      // allow retry later in the same hour window
      globalThis.__fwfQuizDeadlineLastRunKey__ = undefined;
    }
  };

  console.info(
    `[quiz-deadline-scheduler] started (VN hour=${targetHour}, every ${Math.round(intervalMs / 60000)}m)`
  );
  void tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}
