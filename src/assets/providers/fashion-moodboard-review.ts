import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../../config.js";
import { writeTextFile } from "../../utils/fs.js";
import type { SectionId } from "../asset-source-provider.js";
import {
  collectableMoodboardSections
} from "./fashion-search-links.js";
import type {
  MoodboardCandidate,
  MoodboardReviewDecision,
  MoodboardReviewItem,
  MoodboardReviewManifest
} from "./fashion-moodboard-types.js";

const MIN_IMAGE_BYTES = 8192;
const MIN_PREMIUM_EDGE = 700;

interface ReviewArgs {
  runId: string;
  section: SectionId | null;
}

interface ApproveArgs {
  runId: string;
  section: SectionId | null;
}

interface MultiApproveArgs {
  runIds: string[];
}

interface CollectDocument {
  generatedAt: string;
  runId: string;
  stagingRoot: string;
  candidates: MoodboardCandidate[];
}

interface Dimensions {
  width: number;
  height: number;
}

export async function runMoodboardReview(args: string[]): Promise<void> {
  const options = parseReviewArgs(args);
  const document = loadCollectDocument(options.runId);
  const reviewRoot = path.join(resolveLibraryRoot(), "review", options.runId);
  const items = reviewCandidates(document, options.section);
  const manifest = buildReviewManifest(document, reviewRoot, items);

  writeReviewArtifacts(manifest);
  await writeTextFile(path.join(config.outputDir, "moodboard_review_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeTextFile(path.join(config.outputDir, "moodboard_review_report.md"), renderReviewReport(manifest));

  console.log(`Moodboard review for run ${options.runId}:`);
  console.log(`  Reviewed: ${manifest.total}`);
  console.log(`  Approve: ${manifest.approve}`);
  console.log(`  Review: ${manifest.review}`);
  console.log(`  Reject: ${manifest.reject}`);
  console.log(`  Contact sheet: ${path.join(reviewRoot, "index.html")}`);
  console.log(`Wrote ${path.join(config.outputDir, "moodboard_review_manifest.json")}`);
  console.log(`Wrote ${path.join(config.outputDir, "moodboard_review_report.md")}`);
}

export async function runMoodboardApprove(args: string[]): Promise<void> {
  const runIds = readRuns(args);
  if (runIds.length > 0) {
    promoteScoreApprovedRuns({ runIds });
    return;
  }

  const options = parseApproveArgs(args);
  const reviewRoot = path.join(resolveLibraryRoot(), "review", options.runId);
  const manifestPath = path.join(reviewRoot, "review_manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Review manifest not found at ${manifestPath}. Run moodboard:review first.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MoodboardReviewManifest;
  const approved = manifest.items.filter(
    (item) =>
      item.suggestedDecision === "approve" &&
      item.absolutePath &&
      (!options.section || item.section === options.section)
  );

  let copied = 0;
  for (const item of approved) {
    if (!item.absolutePath) {
      continue;
    }
    const destDir = path.join(resolveLibraryRoot(), "approved", item.section);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(item.absolutePath, path.join(destDir, item.filename));
    copied += 1;
  }

  console.log(`Moodboard approve for run ${options.runId}: copied ${copied} approved image(s).`);
  console.log(`Approved root: ${path.join(resolveLibraryRoot(), "approved")}`);
}

function promoteScoreApprovedRuns(options: MultiApproveArgs): void {
  const targetRoot = resolveNewFashionAssetsRoot();
  const seenHashes = loadExistingImportHashes(targetRoot);
  const copiedBySection = new Map<SectionId, number>();
  let duplicateSkipped = 0;

  for (const runId of options.runIds) {
    const manifestPath = path.join(resolveLibraryRoot(), "review", runId, "score_manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Score manifest not found at ${manifestPath}. Run moodboard:score first.`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      items: Array<{
        section: SectionId;
        filename: string;
        absolutePath: string | null;
        visionScore?: { decision?: string };
      }>;
    };

    for (const item of manifest.items) {
      if (item.visionScore?.decision !== "approve" || !item.absolutePath || !fs.existsSync(item.absolutePath)) {
        continue;
      }

      const hash = hashFile(item.absolutePath);
      if (seenHashes.has(hash)) {
        duplicateSkipped += 1;
        continue;
      }

      const destDir = path.join(targetRoot, importFolderForSection(item.section));
      fs.mkdirSync(destDir, { recursive: true });
      const destPath = uniqueDestinationPath(destDir, promotedFilename(item.section, runId, item.filename));
      fs.copyFileSync(item.absolutePath, destPath);
      seenHashes.add(hash);
      copiedBySection.set(item.section, (copiedBySection.get(item.section) ?? 0) + 1);
    }
  }

  console.log("Moodboard approve promoted AI-approved score assets:");
  for (const section of collectableMoodboardSections()) {
    console.log(`  ${section}: ${copiedBySection.get(section) ?? 0} copied`);
  }
  console.log(`  duplicate skipped: ${duplicateSkipped}`);
  console.log(`Import root: ${targetRoot}`);
}

function parseReviewArgs(args: string[]): ReviewArgs {
  const runId = resolveRunId(args);
  const section = readSection(args);
  return { runId, section };
}

function parseApproveArgs(args: string[]): ApproveArgs {
  const runId = resolveRunId(args);
  const section = readSection(args);
  return { runId, section };
}

function readRuns(args: string[]): string[] {
  const value = readArgValue(args, "--runs");
  if (!value) {
    return [];
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function resolveRunId(args: string[]): string {
  const explicit = readArgValue(args, "--run");
  if (explicit) {
    return explicit;
  }
  if (args.includes("--latest")) {
    return findLatestRunId();
  }
  throw new Error("Provide --run <runId> or --latest.");
}

function readSection(args: string[]): SectionId | null {
  const value = readArgValue(args, "--section") as SectionId | undefined;
  if (!value) {
    return null;
  }
  const allowed = new Set(collectableMoodboardSections());
  if (!allowed.has(value)) {
    throw new Error(`Unsupported section "${value}". Use one of: ${[...allowed].join(", ")}`);
  }
  return value;
}

function readArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function findLatestRunId(): string {
  const stagingRoot = path.join(resolveLibraryRoot(), "staging");
  if (!fs.existsSync(stagingRoot)) {
    throw new Error(`No staging root found at ${stagingRoot}.`);
  }
  const runs = fs
    .readdirSync(stagingRoot)
    .filter((name) => fs.statSync(path.join(stagingRoot, name)).isDirectory())
    .sort((a, b) => b.localeCompare(a));
  if (runs.length === 0) {
    throw new Error(`No staging runs found at ${stagingRoot}.`);
  }
  return runs[0];
}

function loadCollectDocument(runId: string): CollectDocument {
  const runManifestPath = path.join(resolveLibraryRoot(), "staging", runId, "moodboard_candidates.json");
  if (fs.existsSync(runManifestPath)) {
    return JSON.parse(fs.readFileSync(runManifestPath, "utf8")) as CollectDocument;
  }

  const outputManifestPath = path.join(config.outputDir, "moodboard_candidates.json");
  if (fs.existsSync(outputManifestPath)) {
    const document = JSON.parse(fs.readFileSync(outputManifestPath, "utf8")) as CollectDocument;
    if (document.runId === runId) {
      return document;
    }
  }

  throw new Error(
    `No collect manifest found for run ${runId}. Expected ${runManifestPath} or matching ${outputManifestPath}.`
  );
}

function reviewCandidates(document: CollectDocument, onlySection: SectionId | null): MoodboardReviewItem[] {
  const candidates = onlySection
    ? document.candidates.filter((candidate) => candidate.section === onlySection)
    : document.candidates;
  const hashes = new Map<string, string>();
  const sourceKeys = new Map<string, string>();

  return candidates.map((candidate) => {
    const reasons: string[] = [];
    const absolutePath = candidate.downloadedPath;
    const filename = absolutePath ? path.basename(absolutePath) : filenameFromCandidate(candidate);
    let width: number | null = null;
    let height: number | null = null;
    let contentHash: string | null = null;

    if (candidate.status !== "downloaded") {
      reasons.push(`metadata status is ${candidate.status}`);
    }
    if (!candidate.contentType?.toLowerCase().startsWith("image/")) {
      reasons.push(`content-type is ${candidate.contentType ?? "missing"}`);
    }
    if ((candidate.bytes ?? 0) < MIN_IMAGE_BYTES) {
      reasons.push(`file is under ${MIN_IMAGE_BYTES} bytes`);
    }
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      reasons.push("downloaded file is missing");
    }

    if (absolutePath && fs.existsSync(absolutePath)) {
      const buffer = fs.readFileSync(absolutePath);
      contentHash = sha256(buffer);
      const dimensions = readImageDimensions(buffer);
      width = dimensions?.width ?? null;
      height = dimensions?.height ?? null;
      if (dimensions && Math.min(dimensions.width, dimensions.height) < MIN_PREMIUM_EDGE) {
        reasons.push(`image is below ${MIN_PREMIUM_EDGE}px on the short edge`);
      }
      if (!dimensions) {
        reasons.push("image dimensions could not be read");
      }
    }

    if (contentHash) {
      const duplicate = hashes.get(contentHash);
      if (duplicate) {
        reasons.push(`duplicate exact hash of ${duplicate}`);
      } else {
        hashes.set(contentHash, filename);
      }
    }

    const sourceKey = `${candidate.section}:${candidate.normalizedImageUrl || candidate.originalImageUrl}`;
    const sourceDuplicate = sourceKeys.get(sourceKey);
    if (sourceDuplicate) {
      reasons.push(`duplicate source URL of ${sourceDuplicate}`);
    } else {
      sourceKeys.set(sourceKey, filename);
    }

    const decision = decide(reasons);
    const semanticReasons = decision === "review" ? sectionReviewReasons(candidate.section) : [];

    return {
      ...candidate,
      filename,
      absolutePath,
      width,
      height,
      contentHash,
      suggestedDecision: decision,
      reasons: [...reasons, ...semanticReasons]
    };
  });
}

function decide(reasons: string[]): MoodboardReviewDecision {
  return reasons.length > 0 ? "reject" : "review";
}

function sectionReviewReasons(section: SectionId): string[] {
  const shared = [
    "human review required for text overlay/watermark",
    "human review required for premium/elegant 35-55 fit"
  ];
  switch (section) {
    case "westen":
      return ["verify sleeveless vest/waistcoat/sleeveless blazer is visible", ...shared];
    case "blusen":
      return ["verify blouse or shirt-blouse is visible", ...shared];
    case "weisse_hosen":
      return ["verify white trousers or white wide-leg pants are visible", ...shared];
    case "rocke":
      return ["verify midi/maxi skirt is visible and not mini skirt", ...shared];
    case "tops":
      return ["verify high-quality satin/silk/viscose/elegant top", ...shared];
    case "intro":
      return ["verify elegant summer outfit / quiet luxury styling", ...shared];
    default:
      return shared;
  }
}

function buildReviewManifest(
  document: CollectDocument,
  reviewRoot: string,
  items: MoodboardReviewItem[]
): MoodboardReviewManifest {
  return {
    generatedAt: new Date().toISOString(),
    runId: document.runId,
    stagingRoot: document.stagingRoot,
    reviewRoot,
    total: items.length,
    approve: items.filter((item) => item.suggestedDecision === "approve").length,
    review: items.filter((item) => item.suggestedDecision === "review").length,
    reject: items.filter((item) => item.suggestedDecision === "reject").length,
    items
  };
}

function writeReviewArtifacts(manifest: MoodboardReviewManifest): void {
  fs.mkdirSync(manifest.reviewRoot, { recursive: true });
  fs.writeFileSync(path.join(manifest.reviewRoot, "review_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(
    path.join(manifest.reviewRoot, "approved_manifest.json"),
    JSON.stringify(filterManifest(manifest, "approve"), null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(manifest.reviewRoot, "review_manifest_items.json"),
    JSON.stringify(filterManifest(manifest, "review"), null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(manifest.reviewRoot, "rejected_manifest.json"),
    JSON.stringify(filterManifest(manifest, "reject"), null, 2) + "\n"
  );
  fs.writeFileSync(path.join(manifest.reviewRoot, "index.html"), renderContactSheet(manifest, null));

  for (const section of collectableMoodboardSections()) {
    const sectionItems = manifest.items.filter((item) => item.section === section);
    if (sectionItems.length === 0) {
      continue;
    }
    fs.writeFileSync(path.join(manifest.reviewRoot, `${section}.html`), renderContactSheet({ ...manifest, items: sectionItems }, section));
  }
}

function filterManifest(manifest: MoodboardReviewManifest, decision: MoodboardReviewDecision): MoodboardReviewItem[] {
  return manifest.items.filter((item) => item.suggestedDecision === decision);
}

function renderReviewReport(manifest: MoodboardReviewManifest): string {
  return [
    "# Fashion Moodboard Review Report",
    "",
    `Generated: ${manifest.generatedAt}`,
    `Run ID: ${manifest.runId}`,
    `Staging root: \`${manifest.stagingRoot}\``,
    `Contact sheet: \`${path.join(manifest.reviewRoot, "index.html")}\``,
    "",
    "## Totals",
    "",
    `- Reviewed: ${manifest.total}`,
    `- Suggested approve: ${manifest.approve}`,
    `- Needs review: ${manifest.review}`,
    `- Rejected: ${manifest.reject}`,
    "",
    "## Gate",
    "",
    "No image is render-ready from this command alone. Only images explicitly marked `approve` in the review manifest and copied by `npm run moodboard:approve` should move to the approved library.",
    ""
  ].join("\n");
}

function renderContactSheet(manifest: MoodboardReviewManifest, section: SectionId | null): string {
  const title = section ? `Fashion Moodboard Review - ${section}` : "Fashion Moodboard Review";
  const cards = manifest.items.map(renderCard).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #1f2933; background: #f7f7f4; }
    header { margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .summary { color: #52606d; line-height: 1.45; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .card { background: #fff; border: 1px solid #d9e2ec; border-radius: 8px; overflow: hidden; }
    .thumb { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; background: #e4e7eb; display: block; }
    .meta { padding: 12px; font-size: 13px; line-height: 1.4; }
    .decision { display: inline-block; padding: 3px 8px; border-radius: 999px; font-weight: 700; margin-bottom: 8px; }
    .approve { background: #d8f3dc; color: #1b5e20; }
    .review { background: #fff3bf; color: #7c5800; }
    .reject { background: #ffd6d6; color: #8a1c1c; }
    .label { font-weight: 700; color: #334e68; }
    a { color: #0b5cad; overflow-wrap: anywhere; }
    ul { padding-left: 18px; margin: 6px 0 0; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="summary">
      Run: ${escapeHtml(manifest.runId)}<br>
      Reviewed: ${manifest.items.length} | Approve: ${manifest.items.filter((item) => item.suggestedDecision === "approve").length} |
      Review: ${manifest.items.filter((item) => item.suggestedDecision === "review").length} |
      Reject: ${manifest.items.filter((item) => item.suggestedDecision === "reject").length}
    </div>
  </header>
  <main class="grid">
    ${cards}
  </main>
</body>
</html>
`;
}

function renderCard(item: MoodboardReviewItem): string {
  const imageSrc = item.absolutePath ? `file://${item.absolutePath}` : "";
  const reasons = item.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
  return `<article class="card">
  ${imageSrc ? `<img class="thumb" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(item.filename)}">` : `<div class="thumb"></div>`}
  <div class="meta">
    <div class="decision ${item.suggestedDecision}">${item.suggestedDecision}</div>
    <div><span class="label">File:</span> ${escapeHtml(item.filename)}</div>
    <div><span class="label">Section:</span> ${escapeHtml(item.section)}</div>
    <div><span class="label">Query:</span> ${escapeHtml(item.query)}</div>
    <div><span class="label">Bytes:</span> ${item.bytes ?? "n/a"}</div>
    <div><span class="label">Dimensions:</span> ${item.width ?? "?"} x ${item.height ?? "?"}</div>
    <div><span class="label">Status:</span> ${escapeHtml(item.status)}</div>
    <div><span class="label">Source:</span> <a href="${escapeHtml(item.sourcePageUrl)}">${escapeHtml(item.sourcePageUrl)}</a></div>
    <div><span class="label">Decision reason:</span><ul>${reasons}</ul></div>
  </div>
</article>`;
}

function filenameFromCandidate(candidate: MoodboardCandidate): string {
  if (candidate.downloadedPath) {
    return path.basename(candidate.downloadedPath);
  }
  return `${candidate.section}-${hashText(candidate.normalizedImageUrl || candidate.originalImageUrl)}.jpg`;
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function readImageDimensions(buffer: Buffer): Dimensions | null {
  return readPngDimensions(buffer) ?? readGifDimensions(buffer) ?? readWebpDimensions(buffer) ?? readJpegDimensions(buffer);
}

function readPngDimensions(buffer: Buffer): Dimensions | null {
  if (buffer.length < 24 || buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readGifDimensions(buffer: Buffer): Dimensions | null {
  if (buffer.length < 10 || buffer.toString("ascii", 0, 3) !== "GIF") {
    return null;
  }
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function readWebpDimensions(buffer: Buffer): Dimensions | null {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const format = buffer.toString("ascii", 12, 16);
  if (format === "VP8 ") {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (format === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === "VP8X") {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  return null;
}

function readJpegDimensions(buffer: Buffer): Dimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function resolveLibraryRoot(): string {
  return path.join(os.homedir(), "Desktop", "fashion-asset-library");
}

function resolveNewFashionAssetsRoot(): string {
  return process.env.NEW_FASHION_ASSETS_DIR ?? path.join(os.homedir(), "Desktop", "new-fashion-assets");
}

function importFolderForSection(section: SectionId): string {
  switch (section) {
    case "weisse_hosen":
      return "weisse-hosen";
    default:
      return section;
  }
}

function promotedFilename(section: SectionId, runId: string, filename: string): string {
  const safeRunId = runId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `${importFolderForSection(section)}-ai-${safeRunId}-${filename}`;
}

function uniqueDestinationPath(destDir: string, filename: string): string {
  const parsed = path.parse(filename);
  let destPath = path.join(destDir, filename);
  let index = 2;
  while (fs.existsSync(destPath)) {
    destPath = path.join(destDir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return destPath;
}

function loadExistingImportHashes(root: string): Set<string> {
  const hashes = new Set<string>();
  if (!fs.existsSync(root)) {
    return hashes;
  }
  for (const section of collectableMoodboardSections()) {
    const dir = path.join(root, importFolderForSection(section));
    if (!fs.existsSync(dir)) {
      continue;
    }
    for (const filename of fs.readdirSync(dir)) {
      const absolutePath = path.join(dir, filename);
      if (fs.statSync(absolutePath).isFile()) {
        hashes.add(hashFile(absolutePath));
      }
    }
  }
  return hashes;
}

function hashFile(absolutePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
