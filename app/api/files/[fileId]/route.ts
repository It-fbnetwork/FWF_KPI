import { createStorageDownloadUrl, getFileById, getFileByIdWithFallback, getFileRecordById } from "@/lib/server/file-storage";
import { canAccessFileById } from "@/lib/server/data";
import { getSessionUserId } from "@/lib/server/session";

function toAsciiFilename(input: string) {
  const ascii = input
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/["\\]/g, "_")
    .trim();
  return ascii || "file";
}

function encodeRfc5987ValueChars(input: string) {
  return encodeURIComponent(input)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const sessionUserId = await getSessionUserId();
    const canAccess = await canAccessFileById(sessionUserId, fileId);
    if (!canAccess) {
      return new Response("Forbidden", { status: 403 });
    }

    const file = await getFileRecordById(fileId);
    if (!file) {
      const legacyFile = await getFileByIdWithFallback(fileId);
      if (!legacyFile) {
        return new Response("File not found", { status: 404 });
      }

      const safeAsciiName = toAsciiFilename(legacyFile.filename);
      const encodedUnicodeName = encodeRfc5987ValueChars(legacyFile.filename);
      return new Response(legacyFile.buffer, {
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Type": legacyFile.contentType,
          "Cache-Control": "private, max-age=300",
          "Content-Disposition": `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUnicodeName}`,
          "Content-Length": String(legacyFile.size),
        },
      });
    }
    if (!file.storage) {
      const loadedFile = await getFileById(fileId);
      if (!loadedFile) {
        return new Response("File has not been migrated to external storage", { status: 409 });
      }

      const safeAsciiName = toAsciiFilename(loadedFile.filename);
      const encodedUnicodeName = encodeRfc5987ValueChars(loadedFile.filename);
      return new Response(loadedFile.buffer, {
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Type": loadedFile.contentType,
          "Cache-Control": "private, max-age=300",
          "Content-Disposition": `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUnicodeName}`,
          "Content-Length": String(loadedFile.size),
        },
      });
    }

    if (file.storage.provider === "volume") {
      const loadedFile = await getFileById(fileId);
      if (!loadedFile) {
        return new Response("File not found on volume", { status: 404 });
      }

      const rangeHeader = request.headers.get("range");
      const safeAsciiName = toAsciiFilename(loadedFile.filename);
      const encodedUnicodeName = encodeRfc5987ValueChars(loadedFile.filename);
      const baseHeaders = {
        "Accept-Ranges": "bytes",
        "Content-Type": loadedFile.contentType,
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUnicodeName}`,
      };

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (!match) {
          return new Response("Invalid range", { status: 416 });
        }
        const start = Number.parseInt(match[1]!, 10);
        const end = match[2] ? Number.parseInt(match[2], 10) : loadedFile.size - 1;
        if (start >= loadedFile.size || start < 0) {
          return new Response("Requested range not satisfiable", {
            status: 416,
            headers: { "Content-Range": `bytes */${loadedFile.size}` },
          });
        }
        const clampedEnd = Math.min(end, loadedFile.size - 1);
        const chunkBuffer = loadedFile.buffer.subarray(start, clampedEnd + 1);
        return new Response(chunkBuffer, {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${start}-${clampedEnd}/${loadedFile.size}`,
            "Content-Length": String(chunkBuffer.length),
          },
        });
      }

      return new Response(loadedFile.buffer, {
        headers: {
          ...baseHeaders,
          "Content-Length": String(loadedFile.size),
        },
      });
    }

    const downloadUrl = createStorageDownloadUrl({
      storage: file.storage,
      expiresSeconds: 300,
    });

    const rangeHeader = request.headers.get("range");
    const storageResponse = await fetch(downloadUrl, {
      method: "GET",
      headers: rangeHeader ? { Range: rangeHeader } : undefined,
      cache: "no-store",
    });
    if (!storageResponse.ok && storageResponse.status !== 206) {
      const detail = await storageResponse.text().catch(() => "");
      console.error("[files] r2 fetch failed", storageResponse.status, detail.slice(0, 300));
      return new Response("File not found on storage", {
        status: storageResponse.status === 404 ? 404 : 502,
      });
    }

    const headers = new Headers();
    const contentType = storageResponse.headers.get("content-type") || file.contentType;
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("Accept-Ranges", storageResponse.headers.get("accept-ranges") || "bytes");
    const contentLength = storageResponse.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    const contentRange = storageResponse.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);

    const safeAsciiName = toAsciiFilename(file.filename);
    const encodedUnicodeName = encodeRfc5987ValueChars(file.filename);
    headers.set(
      "Content-Disposition",
      `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUnicodeName}`
    );

    return new Response(storageResponse.body, {
      status: storageResponse.status,
      headers,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return new Response("Unauthorized", { status: 401 });
    }
    return new Response("Server error", { status: 500 });
  }
}
