import { GoogleGenerativeAI } from "@google/generative-ai";

export type EssayGradeResult = {
  score: number;
  feedback: string;
  gradedBy: "ai";
  gradedAt: string;
};

type GroqResponse = {
  choices: { message: { content: string } }[];
};

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return candidate;
}

function clampScore(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, Math.round(num)));
}

export async function gradeEssayWithAi(input: {
  documentName: string;
  documentContext: string;
  questionText: string;
  sampleAnswer?: string;
  studentAnswer: string;
}): Promise<EssayGradeResult> {
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  const now = new Date().toISOString();
  const studentAnswer = input.studentAnswer.trim();
  if (!studentAnswer) {
    return {
      score: 0,
      feedback: "Không có câu trả lời để chấm.",
      gradedBy: "ai",
      gradedAt: now,
    };
  }

  const systemPrompt =
    "Bạn là trainer nội bộ chấm bài tự luận. Chỉ trả về JSON hợp lệ: {\"score\":0-100,\"feedback\":\"...\"}.";
  const userPrompt = `Chấm câu tự luận dựa trên tài liệu.

Tài liệu: "${input.documentName}"
Nội dung tham chiếu:
${(input.documentContext || "").slice(0, 12000) || "(không có đoạn text; dựa vào câu hỏi và đáp án mẫu)"}

Câu hỏi:
${input.questionText}

Đáp án mẫu / gợi ý chấm:
${input.sampleAnswer?.trim() || "(không có)"}

Câu trả lời của học viên:
${studentAnswer}

Quy tắc:
- score là số nguyên 0–100
- Đúng trọng tâm tài liệu, đủ ý, diễn đạt rõ → điểm cao
- Lạc đề / sai kiến thức / quá ngắn → điểm thấp
- feedback ngắn 1–3 câu bằng tiếng Việt, nêu điểm mạnh/yếu
Chỉ trả JSON.`;

  let raw = "";

  if (groqApiKey) {
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (groqRes.ok) {
        const data = (await groqRes.json()) as GroqResponse;
        raw = data.choices[0]?.message?.content ?? "";
      }
    } catch (error) {
      console.error("[quiz-essay] groq grade failed", error);
    }
  }

  if (!raw && geminiApiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
      const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
      raw = result.response.text() ?? "";
    } catch (error) {
      console.error("[quiz-essay] gemini grade failed", error);
    }
  }

  if (!raw) {
    return {
      score: 50,
      feedback: "AI tạm thời không chấm được. Trainer vui lòng chấm lại thủ công.",
      gradedBy: "ai",
      gradedAt: now,
    };
  }

  try {
    const parsed = JSON.parse(extractJsonObject(raw)) as { score?: unknown; feedback?: unknown };
    return {
      score: clampScore(parsed.score),
      feedback: typeof parsed.feedback === "string" && parsed.feedback.trim()
        ? parsed.feedback.trim()
        : "AI đã chấm sơ bộ theo nội dung tài liệu.",
      gradedBy: "ai",
      gradedAt: now,
    };
  } catch {
    return {
      score: 50,
      feedback: "AI trả kết quả không hợp lệ. Trainer vui lòng chấm lại thủ công.",
      gradedBy: "ai",
      gradedAt: now,
    };
  }
}
