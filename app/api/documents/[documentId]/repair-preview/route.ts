import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { countPdfPages } from "@/lib/server/pdf-text";
import { getDocumentsData, updateDocumentRecord } from "@/lib/server/data";
import { getFileByApiUrl, saveFileBuffer } from "@/lib/server/file-storage";
import { getSessionUserId } from "@/lib/server/session";
import type { Document, LearningPlan } from "@/lib/documents";

export const maxDuration = 180;

const execFileAsync = promisify(execFile);

function inferBaseName(fileName: string) {
  const idx = fileName.lastIndexOf(".");
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

async function ensureSofficeAvailable() {
  try {
    await execFileAsync("soffice", ["--version"], { timeout: 10000, maxBuffer: 1024 * 1024 });
  } catch {
    throw new Error("Máy chủ chưa cài LibreOffice headless (soffice), không thể tạo lại preview PPTX.");
  }
}

async function convertPptxToPdfBuffer(buffer: Buffer) {
  await ensureSofficeAvailable();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "fwf-pptx-repair-"));
  const inputBase = `input-${randomUUID()}`;
  const inputPath = path.join(tempDir, `${inputBase}.pptx`);
  const outputPath = path.join(tempDir, `${inputBase}.pdf`);

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync(
      "soffice",
      ["--headless", "--convert-to", "pdf:writer_pdf_Export", "--outdir", tempDir, inputPath],
      { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }
    );
    return await readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildRepairedPlan(doc: Document, previewPdfBuffer: Buffer, previewUrl: string): LearningPlan {
  const existingSteps = doc.learningPlan?.steps ?? [];
  const pageCount = countPdfPages(previewPdfBuffer);
  return {
    sourceType: doc.type === "pptx" ? "pptx" : "pdf",
    generatedAt: new Date().toISOString(),
    previewUrl,
    steps: Array.from({ length: pageCount }, (_, index) => {
      const existing = existingSteps[index];
      const pageNumber = index + 1;
      return {
        id: existing?.id ?? (doc.type === "pptx" ? `slide-${pageNumber}` : `page-${pageNumber}`),
        title: existing?.title ?? (doc.type === "pptx" ? `Slide ${pageNumber}` : `Trang ${pageNumber}`),
        kind: doc.type === "pptx" ? "slide" : "page",
        pageNumber,
        slideNumber: doc.type === "pptx" ? pageNumber : undefined,
        content: existing?.content ?? "",
        estimatedSeconds: existing?.estimatedSeconds ?? 25,
        media: existing?.media ?? [],
      };
    }),
  };
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ documentId: string }> }
) {
  try {
    const sessionUserId = await getSessionUserId();
    const { documentId } = await context.params;
    const doc = (await getDocumentsData(sessionUserId)).find((item) => item.id === documentId);
    if (!doc) {
      return NextResponse.json({ ok: false, message: "Không tìm thấy tài liệu hoặc bạn không có quyền sửa." }, { status: 404 });
    }
    if (doc.type !== "pptx" && doc.type !== "pdf") {
      return NextResponse.json({ ok: false, message: "Chỉ hỗ trợ tạo lại preview cho PDF/PPTX." }, { status: 400 });
    }

    const originalFile = await getFileByApiUrl(doc.url);
    if (!originalFile) {
      return NextResponse.json(
        { ok: false, message: "File gốc không còn tồn tại. Cần migrate file cũ từ Mongo/Supabase hoặc upload lại tài liệu này." },
        { status: 404 }
      );
    }

    const previewPdfBuffer = doc.type === "pptx"
      ? await convertPptxToPdfBuffer(originalFile.buffer)
      : originalFile.buffer;
    const previewStored = doc.type === "pptx"
      ? await saveFileBuffer(
          `${inferBaseName(doc.name)}-preview.pdf`,
          previewPdfBuffer,
          "application/pdf",
          {
            originalName: `${inferBaseName(doc.name)}-preview.pdf`,
            generatedFrom: "repair-preview",
            sourceFileId: originalFile.fileId,
            sourceDocumentId: doc.id,
            generatedAt: new Date().toISOString(),
          }
        )
      : originalFile;

    const previewUrl = doc.type === "pptx" ? `/api/files/${previewStored.fileId}` : doc.url;
    if (!previewUrl) {
      return NextResponse.json({ ok: false, message: "Tài liệu chưa có URL file gốc để tạo preview." }, { status: 400 });
    }
    const learningPlan = buildRepairedPlan(doc, previewPdfBuffer, previewUrl);
    const updated = await updateDocumentRecord(sessionUserId, documentId, { learningPlan });
    if (!updated) {
      return NextResponse.json({ ok: false, message: "Không thể cập nhật tài liệu sau khi tạo preview." }, { status: 403 });
    }

    return NextResponse.json({ ok: true, document: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tạo lại preview.";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
