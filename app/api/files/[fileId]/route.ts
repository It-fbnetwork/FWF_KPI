import { getFileByIdWithFallback } from "@/lib/server/file-storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const file = await getFileByIdWithFallback(fileId);
    if (!file) {
      return new Response("File not found", { status: 404 });
    }
    const contentType = file.contentType;
    const fileSize = file.size;
    const fileBuffer = file.buffer;

    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
      // Parse Range: bytes=start-end
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        return new Response("Invalid range", { status: 416 });
      }
      const start = parseInt(match[1]!, 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
      if (start >= fileSize || start < 0) {
        return new Response("Requested range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }
      const clampedEnd = Math.min(end, fileSize - 1);
      if (clampedEnd < start) {
        return new Response("Requested range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }
      const chunkSize = clampedEnd - start + 1;

      const chunkBuffer = fileBuffer.subarray(start, clampedEnd + 1);

      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(chunkBuffer);
          controller.close();
        },
      });

      return new Response(readable, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${clampedEnd}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // Full file response
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(fileBuffer);
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileSize.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${file.filename}"`,
      },
    });
  } catch {
    return new Response("Server error", { status: 500 });
  }
}
