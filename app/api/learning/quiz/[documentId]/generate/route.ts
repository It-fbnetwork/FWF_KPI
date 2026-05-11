import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthState } from "@/lib/server/data";
import { isAdminLikeRole } from "@/lib/auth";
import { getSessionUserId } from "@/lib/server/session";
import type { LearningPlan } from "@/lib/documents";
import { extractPdfTextContent } from "@/lib/server/pdf-text";
import { getFileByApiUrl } from "@/lib/server/file-storage";
import { pgQuery } from "@/lib/postgres";

type Params = { params: Promise<{ documentId: string }> };

type GeneratedQuestion = {
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

type GroqResponse = {
  choices: { message: { content: string } }[];
};

type NormalizedQuestion = {
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
};

function normalizeTextForPrompt(text: string) {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\uFFFD/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

function shuffle<T>(items: T[]) {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j]!, cloned[i]!];
  }
  return cloned;
}

function buildFallbackQuestionsFromText(text: string, count: number): NormalizedQuestion[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12 && line.length <= 160);

  const deduped = Array.from(new Set(lines)).slice(0, 80);
  const snippets = deduped.length >= 4
    ? deduped
    : [
      ...deduped,
      "Tài liệu nhấn mạnh việc tuân thủ quy trình đã ban hành.",
      "Tài liệu yêu cầu phối hợp giữa các bộ phận liên quan.",
      "Tài liệu đề cập mục tiêu nâng cao chất lượng thực thi.",
      "Tài liệu yêu cầu theo dõi và đánh giá kết quả định kỳ.",
    ].slice(0, 8);

  if (snippets.length < 4) return [];

  const output: NormalizedQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const correct = snippets[i % snippets.length]!;
    const wrongPool = snippets.filter((snippet) => snippet !== correct);
    const wrong = shuffle(wrongPool).slice(0, 3);
    if (wrong.length < 3) break;
    const options = shuffle([correct, ...wrong]).slice(0, 4);
    const correctIndex = options.indexOf(correct);
    if (correctIndex < 0) continue;

    output.push({
      text: `Theo nội dung tài liệu, nhận định nào dưới đây xuất hiện trong bài học?`,
      options: options as [string, string, string, string],
      correctIndex,
      explanation: "Đây là nội dung xuất hiện trực tiếp trong tài liệu gốc.",
    });
  }

  return output;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { documentId } = await params;
    const sessionUserId = await getSessionUserId();
    const { user } = await getAuthState(sessionUserId);

    if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    const canManage =
      isAdminLikeRole(user.role) ||
      (user.role === "leader" && user.department === "Vận hành") ||
      (user.role === "store_trainer" && user.department === "Cửa hàng");
    if (!canManage) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

    const { questionCount } = (await request.json()) as { questionCount: number };
    const count = Math.min(Math.max(Number(questionCount) || 5, 1), 30);

    type DocRecord = {
      _id: string;
      name: string;
      type?: "pdf" | "pptx" | "txt" | "link" | "mp4";
      url?: string;
      learningPlan?: LearningPlan;
    };
    let doc: DocRecord | null = null;

    const docRes = await pgQuery<{
      id: string;
      name: string;
      type: "pdf" | "pptx" | "txt" | "link" | "mp4" | null;
      url: string | null;
      learning_plan: LearningPlan | null;
    }>("select id, name, type, url, learning_plan from documents where id = $1 limit 1", [documentId]);
    const row = docRes.rows[0];
    doc = row
      ? {
          _id: row.id,
          name: row.name,
          type: row.type ?? undefined,
          url: row.url ?? undefined,
          learningPlan: row.learning_plan ?? undefined,
        }
      : null;

    if (!doc) return NextResponse.json({ ok: false, message: "Tài liệu không tồn tại." }, { status: 404 });

    const steps = doc.learningPlan?.steps ?? [];
    let textContent = steps
      .map((s) => s.content?.trim())
      .filter(Boolean)
      .join("\n\n");
    const originalFile = await getFileByApiUrl(doc.url);
    const originalFileBuffer = originalFile?.buffer ?? null;

    if (!textContent && doc.learningPlan?.sourceType === "pdf" && originalFileBuffer) {
      textContent = await extractPdfTextContent(originalFileBuffer);
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!groqApiKey && !geminiApiKey) {
      return NextResponse.json(
        { ok: false, message: "Chưa cấu hình GROQ_API_KEY hoặc GEMINI_API_KEY trong .env.local." },
        { status: 500 }
      );
    }

    let rawContent = "";
    const baseSystemPrompt = `Bạn là chuyên gia tạo bài kiểm tra nội bộ doanh nghiệp. Luôn trả về JSON hợp lệ với key "questions" chứa array câu hỏi.`;
    const baseUserPrompt = `Tạo đúng ${count} câu hỏi trắc nghiệm tiếng Việt từ nội dung tài liệu bên dưới.

Quy tắc:
- Mỗi câu có đúng 4 đáp án, chỉ 1 đúng
- "correctIndex" là số nguyên: 0=A, 1=B, 2=C, 3=D
- Câu hỏi bám sát nội dung, rõ ràng, không mơ hồ
- "explanation" giải thích ngắn 1–2 câu tại sao đáp án đó đúng

Trả về JSON theo đúng cấu trúc:
{"questions":[{"text":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"..."}]}`;
    let groqErrorSummary = "";

    // PDF pipeline: send original PDF bytes to Gemini first for better extraction quality.
    if (!rawContent && doc.type === "pdf" && originalFileBuffer && geminiApiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const pdfResult = await model.generateContent([
          {
            text: `${baseSystemPrompt}\n\n${baseUserPrompt}\n\nTên tài liệu: "${doc.name}". Dựa vào file PDF đính kèm, chỉ trả về JSON.`,
          },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: originalFileBuffer.toString("base64"),
            },
          },
        ]);
        rawContent = pdfResult.response.text() ?? "";
      } catch (pdfGeminiError) {
        const summary = pdfGeminiError instanceof Error ? pdfGeminiError.message : "unknown";
        console.error("Gemini PDF pipeline failed:", summary);
      }
    }

    if (!textContent && !rawContent) {
      return NextResponse.json({
        ok: false,
        message: "Không đọc được nội dung từ PDF này. Vui lòng thử file khác hoặc tạo câu hỏi thủ công.",
      }, { status: 422 });
    }

    if (!rawContent && groqApiKey) {
      const cleanedText = normalizeTextForPrompt(textContent).slice(0, 25000);
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.6,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: baseSystemPrompt },
            {
              role: "user",
              content: `${baseUserPrompt}

NỘI DUNG TÀI LIỆU (tên: "${doc.name}"):
${cleanedText}`,
            },
          ],
        }),
      });

      if (groqRes.ok) {
        const groqData = (await groqRes.json()) as GroqResponse;
        rawContent = groqData.choices[0]?.message?.content ?? "";
      } else {
        const errText = await groqRes.text();
        const shouldRetryLooseJson =
          groqRes.status === 400 &&
          (errText.includes("json_validate_failed") || errText.includes("Failed to generate"));

        if (shouldRetryLooseJson) {
          const fallbackRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${groqApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              temperature: 0.5,
              messages: [
                { role: "system", content: baseSystemPrompt },
                {
                  role: "user",
                  content: `${baseUserPrompt}

NỘI DUNG TÀI LIỆU (tên: "${doc.name}"):
${cleanedText}`,
                },
              ],
            }),
          });

          if (fallbackRes.ok) {
            const fallbackData = (await fallbackRes.json()) as GroqResponse;
            rawContent = fallbackData.choices[0]?.message?.content ?? "";
          } else {
            const fallbackText = await fallbackRes.text();
            groqErrorSummary = `Groq fallback ${fallbackRes.status}: ${fallbackText.slice(0, 400)}`;
          }
        } else {
          groqErrorSummary = `Groq ${groqRes.status}: ${errText.slice(0, 400)}`;
        }
      }
    }

    if (!rawContent && geminiApiKey && textContent) {
      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const cleanedText = normalizeTextForPrompt(textContent).slice(0, 25000);
        const geminiPrompt = `${baseSystemPrompt}

${baseUserPrompt}

NỘI DUNG TÀI LIỆU (tên: "${doc.name}"):
${cleanedText}

CHỈ TRẢ VỀ JSON, KHÔNG GIẢI THÍCH THÊM.`;
        const geminiResult = await model.generateContent(geminiPrompt);
        rawContent = geminiResult.response.text() ?? "";
      } catch (geminiError) {
        const geminiErrorSummary = geminiError instanceof Error ? geminiError.message : "Gemini unknown error";
        console.error("Gemini fallback failed:", geminiErrorSummary);
      }
    }

    if (!rawContent) {
      const fallback = buildFallbackQuestionsFromText(textContent, count);
      if (fallback.length > 0) {
        return NextResponse.json({
          ok: true,
          questions: fallback,
          documentName: doc.name,
          fallback: true,
          warning: "AI tạm thời lỗi, hệ thống đã tạo bộ câu hỏi nháp để bạn chỉnh sửa nhanh.",
        });
      }
      if (groqErrorSummary) console.error("Quiz auto-generate failed:", groqErrorSummary);
      throw new Error("Không thể tạo câu hỏi tự động lúc này. Vui lòng thử lại.");
    }

    let parsed: { questions: GeneratedQuestion[] };
    try {
      parsed = JSON.parse(extractJsonObject(rawContent)) as { questions: GeneratedQuestion[] };
    } catch {
      return NextResponse.json({ ok: false, message: "AI trả về dữ liệu không hợp lệ, thử lại." }, { status: 422 });
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const validated = questions
      .filter((q) => q.text && Array.isArray(q.options) && q.options.length === 4 && typeof q.correctIndex === "number")
      .slice(0, count)
      .map((q) => ({
        text: q.text,
        options: q.options.slice(0, 4) as [string, string, string, string],
        correctIndex: Math.min(Math.max(Math.round(q.correctIndex), 0), 3),
        explanation: q.explanation ?? "",
      }));

    if (validated.length === 0) {
      const fallback = buildFallbackQuestionsFromText(textContent, count);
      if (fallback.length > 0) {
        return NextResponse.json({
          ok: true,
          questions: fallback,
          documentName: doc.name,
          fallback: true,
          warning: "AI trả kết quả chưa hợp lệ, hệ thống đã tạo bộ câu hỏi nháp để bạn chỉnh sửa.",
        });
      }
      return NextResponse.json({ ok: false, message: "Không thể tạo câu hỏi từ nội dung này, thử lại." }, { status: 422 });
    }

    return NextResponse.json({ ok: true, questions: validated, documentName: doc.name });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Lỗi tạo câu hỏi tự động";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
