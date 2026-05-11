import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getSessionUserId } from "@/lib/server/session";
import type { LearningPlan } from "@/lib/documents";
import { countPdfPages } from "@/lib/server/pdf-text";
import { getSupabaseStorageConfig, saveSupabaseStorageReference, type SupabaseStorageRef } from "@/lib/server/file-storage";

function inferMimeType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}

async function downloadStorageObject(storage: SupabaseStorageRef) {
  const config = getSupabaseStorageConfig();
  if (!config) throw new Error("Supabase Storage chưa được cấu hình");

  const objectPathEncoded = storage.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const readUrl = `${config.baseUrl}/storage/v1/object/${encodeURIComponent(storage.bucket)}/${objectPathEncoded}`;
  const readResponse = await fetch(readUrl, {
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
    },
    cache: "no-store",
  });

  if (!readResponse.ok) {
    const detail = await readResponse.text().catch(() => "");
    throw new Error(`Không thể đọc file vừa upload (${readResponse.status}): ${detail || readResponse.statusText}`);
  }

  const bytes = await readResponse.arrayBuffer();
  return Buffer.from(bytes);
}

function buildPdfLearningPlan(buffer: Buffer): LearningPlan {
  const pageCount = countPdfPages(buffer);
  return {
    sourceType: "pdf",
    generatedAt: new Date().toISOString(),
    steps: Array.from({ length: pageCount }, (_, index) => ({
      id: `page-${index + 1}`,
      title: `Trang ${index + 1}`,
      kind: "page" as const,
      pageNumber: index + 1,
      content: "",
      estimatedSeconds: 25,
    })),
  };
}

async function buildPptxLearningPlan(buffer: Buffer): Promise<LearningPlan | undefined> {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((filePath) => /^ppt\/slides\/slide\d+\.xml$/.test(filePath))
    .sort((a, b) => {
      const aNum = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? "0");
      const bNum = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? "0");
      return aNum - bNum;
    });

  if (slidePaths.length === 0) return undefined;

  return {
    sourceType: "pptx",
    generatedAt: new Date().toISOString(),
    steps: slidePaths.map((slidePath, idx) => {
      const slideNumber = Number(slidePath.match(/slide(\d+)\.xml$/)?.[1] ?? `${idx + 1}`);
      return {
        id: `slide-${slideNumber}`,
        title: `Slide ${slideNumber}`,
        kind: "slide" as const,
        slideNumber,
        pageNumber: slideNumber,
        content: "",
        estimatedSeconds: 25,
        media: [],
      };
    }),
  };
}

export async function POST(request: Request) {
  try {
    await getSessionUserId();

    const body = (await request.json()) as {
      fileId?: string;
      filename?: string;
      contentType?: string;
      size?: number;
      bucket?: string;
      objectPath?: string;
    };

    const fileId = (body.fileId ?? "").trim();
    const filename = (body.filename ?? "").trim();
    const bucket = (body.bucket ?? "").trim();
    const objectPath = (body.objectPath ?? "").trim();
    const contentType = (body.contentType ?? "").trim() || inferMimeType(filename);
    const size = Number(body.size ?? 0);

    if (!fileId || !filename || !bucket || !objectPath) {
      return NextResponse.json({ ok: false, message: "Thiếu thông tin finalize upload" }, { status: 400 });
    }

    const storage: SupabaseStorageRef = {
      provider: "supabase-storage",
      bucket,
      path: objectPath,
    };

    await saveSupabaseStorageReference({
      fileId,
      filename,
      contentType,
      size,
      storage,
      metadata: {
        originalName: filename,
      },
    });

    const url = `/api/files/${fileId}`;

    let learningPlan: LearningPlan | undefined;
    if (filename.toLowerCase().endsWith(".pdf") || filename.toLowerCase().endsWith(".pptx")) {
      const buffer = await downloadStorageObject(storage);
      if (filename.toLowerCase().endsWith(".pdf")) {
        learningPlan = buildPdfLearningPlan(buffer);
      } else {
        learningPlan = await buildPptxLearningPlan(buffer);
      }
    }

    return NextResponse.json({
      ok: true,
      fileId,
      url,
      learningPlan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể hoàn tất upload";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
