// Active provider: reads candidate assets the user has downloaded into
// Desktop/new-fashion-assets/<section>/. Computes, per file, the metadata the
// audit needs (media type, byte size, pixel dimensions, exact content hash and
// an 8x8 average perceptual hash) using only Node built-ins plus ffmpeg (which
// the project already depends on). Everything degrades gracefully: a missing
// ffmpeg only drops perceptual hashing, an unreadable header only drops
// dimensions — files are never skipped silently.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  COLLECTABLE_SECTIONS,
  getSectionDefinition,
  type CandidateAsset,
  type CollectingProvider,
  type MediaType,
  type SectionId
} from "./asset-source-provider.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);

export class LocalFolderProvider implements CollectingProvider {
  readonly id = "local";
  readonly kind = "local" as const;

  constructor(private readonly baseDir: string) {}

  isAvailable(): boolean {
    return fs.existsSync(this.baseDir);
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  async collect(sections: SectionId[]): Promise<CandidateAsset[]> {
    const ffmpegAvailable = isFfmpegAvailable();
    const candidates: CandidateAsset[] = [];

    for (const section of sections) {
      const definition = getSectionDefinition(section);
      if (!definition.importFolder) {
        continue;
      }

      const dir = path.join(this.baseDir, definition.importFolder);
      if (!fs.existsSync(dir)) {
        continue;
      }

      for (const name of fs.readdirSync(dir).sort((a, b) => a.localeCompare(b))) {
        const absolutePath = path.join(dir, name);
        if (!fs.statSync(absolutePath).isFile()) {
          continue;
        }

        const extension = path.extname(name).toLowerCase();
        const mediaType = classifyMedia(extension);
        if (mediaType === "unknown") {
          continue;
        }

        candidates.push(this.describe(section, absolutePath, name, extension, mediaType, ffmpegAvailable));
      }
    }

    return candidates;
  }

  private describe(
    section: SectionId,
    absolutePath: string,
    filename: string,
    extension: string,
    mediaType: MediaType,
    ffmpegAvailable: boolean
  ): CandidateAsset {
    const flags: string[] = [];
    let bytes: number | null = null;
    let buffer: Buffer | null = null;

    try {
      bytes = fs.statSync(absolutePath).size;
    } catch {
      flags.push("unreadable-stat");
    }

    if (mediaType === "image") {
      try {
        buffer = fs.readFileSync(absolutePath);
      } catch {
        flags.push("unreadable-bytes");
      }
    }

    const contentHash = buffer ? sha256(buffer) : hashFileStreaming(absolutePath, flags);
    const dimensions = buffer ? readImageDimensions(buffer) : null;
    const perceptualHash = ffmpegAvailable ? averageHash(absolutePath) : null;

    if (!perceptualHash && ffmpegAvailable && mediaType === "image") {
      flags.push("phash-failed");
    }

    return {
      section,
      providerId: this.id,
      absolutePath,
      sourceUrl: null,
      filename,
      mediaType,
      extension,
      bytes,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      contentHash,
      perceptualHash,
      flags
    };
  }
}

export function collectableSectionIds(): SectionId[] {
  return COLLECTABLE_SECTIONS.map((definition) => definition.id);
}

function classifyMedia(extension: string): MediaType {
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  return "unknown";
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function hashFileStreaming(absolutePath: string, flags: string[]): string | null {
  try {
    return sha256(fs.readFileSync(absolutePath));
  } catch {
    flags.push("hash-failed");
    return null;
  }
}

// ---- perceptual (average) hash via ffmpeg: 8x8 grayscale -> 64-bit aHash ----

let ffmpegAvailabilityCache: boolean | null = null;

function isFfmpegAvailable(): boolean {
  if (ffmpegAvailabilityCache !== null) {
    return ffmpegAvailabilityCache;
  }

  const result = spawnSync("ffmpeg", ["-version"], { encoding: "buffer" });
  ffmpegAvailabilityCache = !result.error && result.status === 0;
  return ffmpegAvailabilityCache;
}

function averageHash(absolutePath: string): string | null {
  const result = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", absolutePath, "-frames:v", "1", "-vf", "scale=8:8,format=gray", "-f", "rawvideo", "-"],
    { encoding: "buffer", maxBuffer: 1024 * 1024 }
  );

  if (result.error || result.status !== 0 || !result.stdout || result.stdout.length < 64) {
    return null;
  }

  const pixels = result.stdout.subarray(0, 64);
  let sum = 0;
  for (const value of pixels) {
    sum += value;
  }
  const average = sum / 64;

  let bits = "";
  for (const value of pixels) {
    bits += value >= average ? "1" : "0";
  }

  return binaryToHex(bits);
}

function binaryToHex(bits: string): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

// ---- pure-TS image dimension readers (no decode, header parsing only) ----

interface Dimensions {
  width: number;
  height: number;
}

function readImageDimensions(buffer: Buffer): Dimensions | null {
  return (
    readPngDimensions(buffer) ??
    readGifDimensions(buffer) ??
    readWebpDimensions(buffer) ??
    readJpegDimensions(buffer)
  );
}

function readPngDimensions(buffer: Buffer): Dimensions | null {
  if (buffer.length < 24) {
    return null;
  }
  // PNG signature + IHDR chunk: width/height are big-endian uint32 at 16/20.
  const isPng =
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (!isPng) {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readGifDimensions(buffer: Buffer): Dimensions | null {
  if (buffer.length < 10) {
    return null;
  }
  if (buffer.toString("ascii", 0, 3) !== "GIF") {
    return null;
  }
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function readWebpDimensions(buffer: Buffer): Dimensions | null {
  if (buffer.length < 30) {
    return null;
  }
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }

  const format = buffer.toString("ascii", 12, 16);
  if (format === "VP8 ") {
    // Lossy: 16-bit dimensions at offset 26/28 (14-bit each).
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (format === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  if (format === "VP8X") {
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { width, height };
  }
  return null;
}

function readJpegDimensions(buffer: Buffer): Dimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    // SOF0..SOF15 carry the frame dimensions, excluding the non-baseline
    // markers that are not start-of-frame (C4 DHT, C8 JPG, CC DAC).
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) {
      return null;
    }
    offset += 2 + segmentLength;
  }

  return null;
}

export function hammingDistanceHex(a: string | null, b: string | null): number | null {
  if (!a || !b || a.length !== b.length) {
    return null;
  }

  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}
