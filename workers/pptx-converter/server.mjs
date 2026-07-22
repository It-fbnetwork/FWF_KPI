import express from "express";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const app = express();

const PORT = Number(process.env.PORT ?? "3000");
const TOKEN = process.env.PPTX_CONVERTER_TOKEN?.trim() ?? "";
const MAX_BODY_MB = Number(process.env.PPTX_CONVERTER_MAX_BODY_MB ?? "80");

app.use(express.raw({
  type: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/octet-stream",
  ],
  limit: `${MAX_BODY_MB}mb`,
}));

app.get("/health", async (_req, res) => {
  try {
    const { stdout } = await execFileAsync("soffice", ["--version"], {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    res.json({ ok: true, soffice: stdout.trim() });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "soffice unavailable",
    });
  }
});

app.post("/convert/pptx-to-pdf", async (req, res) => {
  try {
    if (TOKEN) {
      const authHeader = req.header("authorization") ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
      if (token !== TOKEN) {
        res.status(401).json({ ok: false, message: "Unauthorized converter request." });
        return;
      }
    }

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? []);
    if (!buffer.length) {
      res.status(400).json({ ok: false, message: "Empty request body." });
      return;
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "pptx-converter-"));
    const basename = `input-${randomUUID()}`;
    const inputPath = path.join(tempDir, `${basename}.pptx`);
    const outputPath = path.join(tempDir, `${basename}.pdf`);

    try {
      await writeFile(inputPath, buffer);
      await execFileAsync(
        "soffice",
        ["--headless", "--convert-to", "pdf:writer_pdf_Export", "--outdir", tempDir, inputPath],
        { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }
      );
      const pdf = await readFile(outputPath);
      res.setHeader("content-type", "application/pdf");
      res.status(200).send(pdf);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Failed to convert PPTX.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`pptx-converter listening on :${PORT}`);
});
