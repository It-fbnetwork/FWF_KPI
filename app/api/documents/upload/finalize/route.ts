import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { getSessionUserId } from "@/lib/server/session";
import type { LearningPlan, LearningStepMedia } from "@/lib/documents";
import { countPdfPages } from "@/lib/server/pdf-text";
import { getSupabaseStorageConfig, saveFileBuffer, saveSupabaseStorageReference, type SupabaseStorageRef } from "@/lib/server/file-storage";

export const maxDuration = 180;
const execFileAsync = promisify(execFile);
const STRICT_PPTX_FIDELITY = (process.env.STRICT_PPTX_FIDELITY ?? "true").trim().toLowerCase() !== "false";
const WEB_SAFE_FONT_SET = new Set([
  "arial",
  "arial black",
  "calibri",
  "cambria",
  "candara",
  "courier new",
  "georgia",
  "helvetica",
  "tahoma",
  "times new roman",
  "trebuchet ms",
  "verdana",
]);
let sofficeAvailabilityChecked = false;

async function ensureSofficeAvailable() {
  if (sofficeAvailabilityChecked) return;
  try {
    await execFileAsync("soffice", ["--version"], { timeout: 10000, maxBuffer: 1024 * 1024 });
    sofficeAvailabilityChecked = true;
  } catch {
    throw new Error(
      "Máy chủ production chưa cài LibreOffice headless (soffice). Không thể convert PPTX sang PDF để giữ đúng định dạng."
    );
  }
}

function inferMimeType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
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

function isVideoPath(filePath: string) {
  const lower = filePath.toLowerCase();
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

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

async function inspectPptxRenderingRisk(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const warnings: string[] = [];

  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (presentationXml) {
    const sizeMatch = presentationXml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
    if (sizeMatch?.[1] && sizeMatch?.[2]) {
      const cx = Number(sizeMatch[1]);
      const cy = Number(sizeMatch[2]);
      if (Number.isFinite(cx) && Number.isFinite(cy) && cx > 0 && cy > 0) {
        const ratio = cx / cy;
        const ratioDiff = Math.abs(ratio - (16 / 9));
        if (ratioDiff > 0.02) {
          const divisor = gcd(cx, cy);
          warnings.push(
            `Slide hiện tại không theo tỉ lệ 16:9 (${Math.round(cx / divisor)}:${Math.round(cy / divisor)}). Khuyến nghị đổi sang 16:9 để tránh méo/cắt khi hiển thị web.`
          );
        }
      }
    }
  }

  const fontCandidates = new Set<string>();
  const fontRegex = /typeface="([^"]+)"/g;
  for (const filePath of Object.keys(zip.files)) {
    if (!/^ppt\/(theme|slideMasters|slides|fontTable)\//.test(filePath) || !filePath.endsWith(".xml")) continue;
    const xml = await zip.file(filePath)?.async("text");
    if (!xml) continue;
    let match: RegExpExecArray | null;
    while ((match = fontRegex.exec(xml)) !== null) {
      const fontName = (match[1] ?? "").trim();
      if (fontName) fontCandidates.add(fontName);
    }
  }

  const riskyFonts = [...fontCandidates].filter((font) => {
    const normalized = font.toLowerCase();
    if (normalized.startsWith("+")) return false; // theme placeholders
    return !WEB_SAFE_FONT_SET.has(normalized);
  });

  if (riskyFonts.length > 0) {
    warnings.push(
      `Phát hiện font có nguy cơ lệch khi render web: ${riskyFonts.slice(0, 6).join(", ")}${riskyFonts.length > 6 ? "..." : ""}. Nên export PDF và/hoặc embed font trước khi upload.`
    );
  }

  return warnings;
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

async function buildPptxLearningPlan(buffer: Buffer, originalName: string): Promise<LearningPlan | undefined> {
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
      const mediaInStep = new Set<string>();
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
            const stored = await saveFileBuffer(
              `${baseName}-slide-${slideNumber}-${mediaName}`,
              mediaBuffer,
              contentType,
              {
                originalName: mediaName,
                generatedFrom: "pptx-video",
                sourceName: originalName,
                generatedAt: new Date().toISOString(),
              }
            );
            mediaEntry = {
              id: `media-${stored.fileId}`,
              type: "video",
              url: `/api/files/${stored.fileId}`,
              mimeType: contentType,
              fileName: mediaName,
            };
            mediaCache.set(resolvedPath, mediaEntry);
          }
          if (!mediaInStep.has(mediaEntry.id)) {
            media.push(mediaEntry);
            mediaInStep.add(mediaEntry.id);
          }
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
  };
}

async function convertPptxToPdfBuffer(buffer: Buffer) {
  await ensureSofficeAvailable();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "fwf-pptx-finalize-"));
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

function buildPptxPreviewPlan(previewPdfBuffer: Buffer, previewUrl: string): LearningPlan {
  const pageCount = countPdfPages(previewPdfBuffer);
  return {
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
    const warnings: string[] = [];
    if (filename.toLowerCase().endsWith(".pdf") || filename.toLowerCase().endsWith(".pptx")) {
      const buffer = await downloadStorageObject(storage);
      if (filename.toLowerCase().endsWith(".pdf")) {
        learningPlan = buildPdfLearningPlan(buffer);
      } else {
        warnings.push(...(await inspectPptxRenderingRisk(buffer)));
        const extractedPptxPlan = await buildPptxLearningPlan(buffer, filename);
        try {
          const previewPdfBuffer = await convertPptxToPdfBuffer(buffer);
          const previewStored = await saveFileBuffer(
            `${inferBaseName(filename)}-preview.pdf`,
            previewPdfBuffer,
            "application/pdf",
            {
              originalName: `${inferBaseName(filename)}-preview.pdf`,
              generatedFrom: "pptx",
              sourceFileId: fileId,
              generatedAt: new Date().toISOString(),
            }
          );
          const previewUrl = `/api/files/${previewStored.fileId}`;
          if (extractedPptxPlan) {
            learningPlan = {
              ...extractedPptxPlan,
              previewUrl,
            };
          } else {
            learningPlan = buildPptxPreviewPlan(previewPdfBuffer, previewUrl);
          }
        } catch (conversionError) {
          console.error("PPTX->PDF conversion failed in finalize:", conversionError);
          if (STRICT_PPTX_FIDELITY) {
            throw new Error(
              "Không thể đảm bảo định dạng PPTX trên hệ thống hiện tại. Vui lòng xuất file sang PDF (High quality + Embed fonts) và upload lại."
            );
          }
          warnings.push(
            "Không thể chuyển PPTX sang PDF preview trên môi trường hiện tại. Hệ thống đang dùng chế độ fallback (trích xuất text), nên bố cục có thể khác file gốc."
          );
          learningPlan = extractedPptxPlan;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      fileId,
      url,
      learningPlan,
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể hoàn tất upload";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
