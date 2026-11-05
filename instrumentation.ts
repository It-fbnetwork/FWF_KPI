export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startQuizDeadlineReminderScheduler } = await import("@/lib/server/quiz-deadline-scheduler");
  startQuizDeadlineReminderScheduler();
}
