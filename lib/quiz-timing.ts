export function getQuizDurationMinutes(
  questions: ReadonlyArray<{ type?: string }>,
  timePerQuestionSeconds = 30,
) {
  const mcqSeconds = Math.max(5, Math.floor(timePerQuestionSeconds || 30));
  const totalSeconds = questions.reduce(
    (total, question) => total + (question.type === "essay" ? 60 : mcqSeconds),
    0,
  );
  return Math.ceil(totalSeconds / 60);
}
