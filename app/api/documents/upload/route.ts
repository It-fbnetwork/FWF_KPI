import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { getSessionUserId } from "@/lib/server/session";
import type { LearningPlan, LearningStepMedia } from "@/lib/documents";
import { countPdfPages, extractPdfTextContent, splitTextByPage } from "@/lib/server/pdf-text";
import { saveFileBuffer } from "@/lib/server/file-storage";

export const maxDuration = 180;
const execFileAsync = promisify(execFile);

function toFriendlyUploadErrorMessage(message: string) {
  if (message.includes("unsupported Unicode escape sequence")) {
    return "Tài liệu chứa ký tự không hợp lệ. Vui lòng xuất lại file PDF/PPTX rồi tải lên lại.";
  }
  if (message.includes("\\u0000") || message.toLowerCase().includes("invalid byte sequence")) {
    return "Nội dung tài liệu không hợp lệ để xử lý. Vui lòng làm sạch nội dung file rồi thử lại.";
  }
  if (message === "No file provided") return "Bạn chưa chọn file để tải lên.";
  if (message === "Unauthorized") return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  return message;
}

function inferMimeType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  return "application/octet-stream";
}

function inferBaseName(fileName: string) {
  const idx = fileName.lastIndexOf(".");
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

function resolvePptxTarget(target: string) {
  const normalized = target.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.startsWith("ppt/")) return normalized;
  if (normalized.startsWith("../")) return `ppt/${normalized.replace(/^(\.\.\/)+/, "")}`;
  if (normalized.startsWith("media/")) return `ppt/${normalized}`;
  return `ppt/slides/${normalized}`;
}

function isVideoPath(path: string) {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".mp4") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".webm") ||
    lower.endsWith(".m4v")
  );
}

function collectSlideTextNodes(node: unknown, collector: string[]) {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const child of node) {
      collectSlideTextNodes(child, collector);
    }
    return;
  }

  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if ((key === "a:t" || key === "t") && typeof value === "string") {
      const normalized = value.replace(/\s+/g, " ").trim();
      if (normalized) collector.push(normalized);
      continue;
    }
    collectSlideTextNodes(value, collector);
  }
}

async function extractPptxSlideText(zip: JSZip, parser: XMLParser, slidePath: string) {
  const slideFile = zip.file(slidePath);
  if (!slideFile) return "";

  const slideXml = await slideFile.async("text");
  const parsed = parser.parse(slideXml) as Record<string, unknown>;
  const textNodes: string[] = [];
  collectSlideTextNodes(parsed, textNodes);
  return textNodes.join("\n");
}

async function uploadBufferToStorage(
  filename: string,
  buffer: Buffer,
  contentType: string
) {
  const stored = await saveFileBuffer(filename, buffer, contentType, {
    originalName: filename,
    uploadedAt: new Date().toISOString(),
  });
  return stored.fileId;
}

async function buildPdfLearningPlan(buffer: Buffer): Promise<LearningPlan> {
  const pageCount = countPdfPages(buffer);
  const shouldExtractText =
    String(process.env.PDF_EXTRACT_TEXT_ON_UPLOAD ?? "").toLowerCase() === "true";
  const pageContents = shouldExtractText
    ? splitTextByPage(await extractPdfTextContent(buffer), pageCount)
    : [];
  return {
    sourceType: "pdf",
    generatedAt: new Date().toISOString(),
    steps: Array.from({ length: pageCount }, (_, index) => ({
      id: `page-${index + 1}`,
      title: `Trang ${index + 1}`,
      kind: "page" as const,
      pageNumber: index + 1,
      content: pageContents[index] ?? "",
      estimatedSeconds: 25,
    })),
  };
}

async function buildPptxLearningPlan(
  buffer: Buffer,
  originalName: string,
  previewUrl?: string
): Promise<LearningPlan | undefined> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  });

  const slidePaths = Object.keys(zip.files)
    .filter((filePath) => /^ppt\/slides\/slide\d+\.xml$/.test(filePath))
    .sort((a, b) => {
      const aNum = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? "0");
      const bNum = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? "0");
      return aNum - bNum;
    });

  if (slidePaths.length === 0) return undefined;

  const mediaCache = new Map<string, LearningStepMedia>();
  const baseName = inferBaseName(originalName);

  const steps = await Promise.all(
    slidePaths.map(async (slidePath, idx) => {
      const slideNumber = Number(slidePath.match(/slide(\d+)\.xml$/)?.[1] ?? `${idx + 1}`);
      const relPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
      const media: LearningStepMedia[] = [];
      const slideText = await extractPptxSlideText(zip, parser, slidePath);

      const relFile = zip.file(relPath);
      if (relFile) {
        const relXml = await relFile.async("text");
        const parsed = parser.parse(relXml) as {
          Relationships?: { Relationship?: Array<Record<string, string>> | Record<string, string> };
        };

        const relationshipNode = parsed.Relationships?.Relationship;
        const relationships = Array.isArray(relationshipNode)
          ? relationshipNode
          : relationshipNode
            ? [relationshipNode]
            : [];

        for (const rel of relationships) {
          const target = rel.Target;
          const relType = rel.Type ?? "";
          if (!target) continue;
          const resolvedPath = resolvePptxTarget(target);
          const isVideo = relType.toLowerCase().includes("/video") || isVideoPath(resolvedPath);
          if (!isVideo) continue;

          const mediaFile = zip.file(resolvedPath);
          if (!mediaFile) continue;

          let mediaEntry = mediaCache.get(resolvedPath);
          if (!mediaEntry) {
            const mediaBuffer = await mediaFile.async("nodebuffer");
            const mediaName = resolvedPath.split("/").pop() ?? `slide-${slideNumber}-video.mp4`;
            const contentType = inferMimeType(mediaName);
            const mediaId = await uploadBufferToStorage(
              `${baseName}-slide-${slideNumber}-${mediaName}`,
              mediaBuffer,
              contentType
            );
            mediaEntry = {
              id: `media-${mediaId}`,
              type: "video",
              url: `/api/files/${mediaId}`,
              mimeType: contentType,
              fileName: mediaName,
            };
            mediaCache.set(resolvedPath, mediaEntry);
          }
          media.push(mediaEntry);
        }
      }

      return {
        id: `slide-${slideNumber}`,
        title: `Slide ${slideNumber}`,
        kind: "slide" as const,
        slideNumber,
        pageNumber: slideNumber,
        content: slideText,
        estimatedSeconds: media.length > 0 ? 0 : 25,
        media,
      };
    })
  );

  return {
    sourceType: "pptx",
    generatedAt: new Date().toISOString(),
    steps,
    previewUrl,
  };
}

async function convertPptxToPdfBuffer(buffer: Buffer) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "fwf-pptx-"));
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

export async function POST(request: Request) {
  try {
    await getSessionUserId();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, message: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const mimeType = file.type || "application/octet-stream";
    const fileId = await uploadBufferToStorage(file.name, buffer, mimeType);
    const url = `/api/files/${fileId}`;
    const lowerName = file.name.toLowerCase();
    let learningPlan: LearningPlan | undefined;
    if (lowerName.endsWith(".pdf")) {
      learningPlan = await buildPdfLearningPlan(buffer);
    } else if (lowerName.endsWith(".pptx")) {
      let previewUrl: string | undefined;
      let previewPdfBuffer: Buffer | undefined;
      try {
        previewPdfBuffer = await convertPptxToPdfBuffer(buffer);
        const previewPdfId = await uploadBufferToStorage(
          `${inferBaseName(file.name)}-preview.pdf`,
          previewPdfBuffer,
          "application/pdf"
        );
        previewUrl = `/api/files/${previewPdfId}`;
      } catch (conversionError) {
        console.error("PPTX to PDF conversion failed:", conversionError);
      }
      // Prefer PDF-based slide preview for better PPTX fidelity.
      if (previewUrl && previewPdfBuffer) {
        const pageCount = countPdfPages(previewPdfBuffer);
        learningPlan = {
          sourceType: "pptx",
          generatedAt: new Date().toISOString(),
          previewUrl,
          steps: Array.from({ length: pageCount }, (_, index) => ({
            id: `slide-${index + 1}`,
            title: `Slide ${index + 1}`,
            kind: "slide" as const,
            slideNumber: index + 1,
            pageNumber: index + 1,
            content: "",
            estimatedSeconds: 25,
            media: [],
          })),
        };
      } else {
        learningPlan = await buildPptxLearningPlan(buffer, file.name, previewUrl);
      }
    }

    return NextResponse.json({ ok: true, fileId, url, learningPlan });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Upload failed";
    const msg = toFriendlyUploadErrorMessage(rawMessage);
    return NextResponse.json(
      { ok: false, message: msg },
      { status: rawMessage === "Unauthorized" ? 401 : 500 }
    );
  }
}
