export function getLearningPath(id: string, kind: "lesson" | "test" = "lesson") {
  const query = new URLSearchParams({ tab: kind === "test" ? "exams" : "learning", [kind === "test" ? "testId" : "documentId"]: id });
  return `/documents?${query}`;
}

export function getSafeLoginDestination(search: string) {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u0020]/.test(next)) return "/dashboard";
  return next;
}
