import fs from "node:fs";
import path from "node:path";
import type { SectionId } from "../asset-source-provider.js";
import { safeImageExtension, shortUrlHash } from "./pinimg-utils.js";

const MIN_IMAGE_BYTES = 8192;

export interface DownloadCandidateInput {
  section: SectionId;
  source: string;
  normalizedImageUrl: string;
  index: number;
  destDir: string;
}

export interface DownloadCandidateResult {
  downloadedPath: string | null;
  status: "downloaded" | "skipped-non-image" | "skipped-small-file" | "download-error";
  bytes: number | null;
  contentType: string | null;
}

export async function downloadCandidate(input: DownloadCandidateInput): Promise<DownloadCandidateResult> {
  let response: Response;
  try {
    response = await fetch(input.normalizedImageUrl);
  } catch {
    return { downloadedPath: null, status: "download-error", bytes: null, contentType: null };
  }

  const contentType = response.headers.get("content-type");
  if (!response.ok || !contentType?.toLowerCase().startsWith("image/")) {
    return { downloadedPath: null, status: "skipped-non-image", bytes: null, contentType };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await response.arrayBuffer());
  } catch {
    return { downloadedPath: null, status: "download-error", bytes: null, contentType };
  }

  if (buffer.length < MIN_IMAGE_BYTES) {
    return { downloadedPath: null, status: "skipped-small-file", bytes: buffer.length, contentType };
  }

  const filename =
    `moodboard-${input.section}-${input.source}-${shortUrlHash(input.normalizedImageUrl)}-` +
    `${String(input.index).padStart(3, "0")}${safeImageExtension(input.normalizedImageUrl, contentType)}`;
  const downloadedPath = path.join(input.destDir, filename);

  try {
    fs.mkdirSync(input.destDir, { recursive: true });
    fs.writeFileSync(downloadedPath, buffer);
    return { downloadedPath, status: "downloaded", bytes: buffer.length, contentType };
  } catch {
    return { downloadedPath: null, status: "download-error", bytes: buffer.length, contentType };
  }
}
