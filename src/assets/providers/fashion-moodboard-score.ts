import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../../config.js";
import { writeTextFile } from "../../utils/fs.js";
import type { SectionId } from "../asset-source-provider.js";
import { collectableMoodboardSections } from "./fashion-search-links.js";
import type { MoodboardReviewItem, MoodboardReviewManifest } from "./fashion-moodboard-types.js";
import { FashionVisionClient } from "./fashion-vision-client.js";
import type { VisionDecision, VisionScore } from "./fashion-vision-rubric.js";

const DEFAULT_VISION_MODEL = "gpt-4o-mini";

interface ScoreArgs {
  runId: string;
  section: SectionId | null;
  limit: number | null;
  model: string;
}

interface ScoreItem extends MoodboardReviewItem {
  visionScore: VisionScore;
}

interface ScoreManifest {
  generatedAt: string;
  runId: string;
  model: string;
  total: number;
  approve: number;
  review: number;
  reject: number;
  items: ScoreItem[];
}

export async function runMoodboardScore(args: string[]): Promise<void> {
  const options = parseScoreArgs(args);
  const apiKey = config.openaiApiKey;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for moodboard:score.");
  }

  const reviewRoot = path.join(resolveLibraryRoot(), "review", options.runId);
  const reviewManifestPath = path.join(reviewRoot, "review_manifest.json");
  if (!fs.existsSync(reviewManifestPath)) {
    throw new Error(`Review manifest not found at ${reviewManifestPath}. Run moodboard:review first.`);
  }

  const reviewManifest = JSON.parse(fs.readFileSync(reviewManifestPath, "utf8")) as MoodboardReviewManifest;
  const candidates = selectItems(reviewManifest.items, options);
  const client = new FashionVisionClient({ apiKey, model: options.model });
  const scored: ScoreItem[] = [];

  for (const item of candidates) {
    scored.push(await scoreOne(client, item));
  }

  const manifest = buildScoreManifest(options.runId, options.model, scored);
  fs.mkdirSync(reviewRoot, { recursive: true });
  fs.writeFileSync(path.join(reviewRoot, "score_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(reviewRoot, "index.html"), renderScoreContactSheet(manifest));

  await writeTextFile(path.join(config.outputDir, "moodboard_score_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeTextFile(path.join(config.outputDir, "moodboard_score_report.md"), renderScoreReport(manifest, reviewRoot));

  console.log(`Moodboard score for run ${options.runId}:`);
  console.log(`  Scored: ${manifest.total}`);
  console.log(`  Approve: ${manifest.approve}`);
  console.log(`  Review: ${manifest.review}`);
  console.log(`  Reject: ${manifest.reject}`);
  console.log(`  Contact sheet: ${path.join(reviewRoot, "index.html")}`);
  console.log(`Wrote ${path.join(config.outputDir, "moodboard_score_manifest.json")}`);
  console.log(`Wrote ${path.join(config.outputDir, "moodboard_score_report.md")}`);
}

function parseScoreArgs(args: string[]): ScoreArgs {
  const runId = resolveRunId(args);
  const section = readSection(args);
  const limitValue = readArgValue(args, "--limit");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : null;
  if (limit !== null && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error("--limit must be a positive number.");
  }

  return {
    runId,
    section,
    limit,
    model: readArgValue(args, "--model") ?? process.env.VISION_REVIEW_MODEL ?? DEFAULT_VISION_MODEL
  };
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

function selectItems(items: MoodboardReviewItem[], options: ScoreArgs): MoodboardReviewItem[] {
  const selected = items.filter((item) => {
    if (options.section && item.section !== options.section) {
      return false;
    }
    return Boolean(item.absolutePath && fs.existsSync(item.absolutePath) && item.status === "downloaded");
  });
  return options.limit ? selected.slice(0, options.limit) : selected;
}

async function scoreOne(client: FashionVisionClient, item: MoodboardReviewItem): Promise<ScoreItem> {
  if (!item.absolutePath) {
    return { ...item, visionScore: fallbackScore(item, "Downloaded file is missing.") };
  }

  try {
    const visionScore = await client.scoreImage({
      section: item.section,
      fileName: item.filename,
      imagePath: item.absolutePath
    });
    return { ...item, visionScore };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ...item, visionScore: fallbackScore(item, reason) };
  }
}

function fallbackScore(item: MoodboardReviewItem, reason: string): VisionScore {
  return {
    section: item.section,
    fileName: item.filename,
    decision: "review",
    overallScore: 0,
    sectionMatchScore: 0,
    premiumScore: 0,
    ageFitScore: 0,
    textOverlay: false,
    watermark: false,
    garmentVisible: false,
    reasons: [`Scoring error: ${reason}`],
    notes: "AI skorlaması tamamlanamadı; manuel inceleme gerekiyor."
  };
}

function buildScoreManifest(runId: string, model: string, items: ScoreItem[]): ScoreManifest {
  return {
    generatedAt: new Date().toISOString(),
    runId,
    model,
    total: items.length,
    approve: countDecision(items, "approve"),
    review: countDecision(items, "review"),
    reject: countDecision(items, "reject"),
    items
  };
}

function countDecision(items: ScoreItem[], decision: VisionDecision): number {
  return items.filter((item) => item.visionScore.decision === decision).length;
}

function renderScoreReport(manifest: ScoreManifest, reviewRoot: string): string {
  const lines = [
    "# Fashion Moodboard Score Report",
    "",
    `Generated: ${manifest.generatedAt}`,
    `Run ID: ${manifest.runId}`,
    `Model: ${manifest.model}`,
    `Contact sheet: \`${path.join(reviewRoot, "index.html")}\``,
    "",
    "## Totals",
    "",
    `- Scored: ${manifest.total}`,
    `- Suggested approve: ${manifest.approve}`,
    `- Needs review: ${manifest.review}`,
    `- Rejected: ${manifest.reject}`,
    "",
    "## Items",
    "",
    "| File | Section | Decision | Score | Reason |",
    "|---|---|---|---:|---|"
  ];

  for (const item of manifest.items) {
    lines.push(
      `| ${item.filename} | ${item.section} | ${item.visionScore.decision} | ` +
        `${item.visionScore.overallScore} | ${escapeMarkdown(item.visionScore.reasons.join("; "))} |`
    );
  }

  lines.push("", "Scoring only writes manifests and contact sheets. It does not copy to approved/rejected folders or unlock rendering.", "");
  return lines.join("\n");
}

function renderScoreContactSheet(manifest: ScoreManifest): string {
  const cards = manifest.items.map(renderScoreCard).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fashion Moodboard Score - ${escapeHtml(manifest.runId)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #1f2933; background: #f7f7f4; }
    header { margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .summary { color: #52606d; line-height: 1.45; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .card { background: #fff; border: 1px solid #d9e2ec; border-radius: 8px; overflow: hidden; }
    .thumb { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; background: #e4e7eb; display: block; }
    .meta { padding: 12px; font-size: 13px; line-height: 1.4; }
    .badge { display: inline-block; padding: 4px 9px; border-radius: 999px; font-weight: 700; margin: 0 6px 8px 0; }
    .approve { background: #d8f3dc; color: #1b5e20; }
    .review { background: #fff3bf; color: #7c5800; }
    .reject { background: #ffd6d6; color: #8a1c1c; }
    .score { background: #dbeafe; color: #1e3a8a; }
    .label { font-weight: 700; color: #334e68; }
    ul { padding-left: 18px; margin: 6px 0 0; }
  </style>
</head>
<body>
  <header>
    <h1>Fashion Moodboard Score</h1>
    <div class="summary">
      Run: ${escapeHtml(manifest.runId)}<br>
      Model: ${escapeHtml(manifest.model)}<br>
      Scored: ${manifest.total} | Approve: ${manifest.approve} | Review: ${manifest.review} | Reject: ${manifest.reject}
    </div>
  </header>
  <main class="grid">
    ${cards}
  </main>
</body>
</html>
`;
}

function renderScoreCard(item: ScoreItem): string {
  const score = item.visionScore;
  const reasons = score.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
  return `<article class="card">
  <img class="thumb" src="${escapeHtml(`file://${item.absolutePath ?? ""}`)}" alt="${escapeHtml(item.filename)}">
  <div class="meta">
    <div>
      <span class="badge ${score.decision}">${score.decision}</span>
      <span class="badge score">${score.overallScore}/100</span>
    </div>
    <div><span class="label">File:</span> ${escapeHtml(item.filename)}</div>
    <div><span class="label">Section:</span> ${escapeHtml(item.section)}</div>
    <div><span class="label">Scores:</span> section ${score.sectionMatchScore}, premium ${score.premiumScore}, age-fit ${score.ageFitScore}</div>
    <div><span class="label">Garment:</span> ${score.garmentVisible ? "visible" : "not clear"} | <span class="label">Text:</span> ${score.textOverlay ? "yes" : "no"} | <span class="label">Watermark:</span> ${score.watermark ? "yes" : "no"}</div>
    <div><span class="label">Reason:</span><ul>${reasons}</ul></div>
    <div><span class="label">Notes:</span> ${escapeHtml(score.notes)}</div>
  </div>
</article>`;
}

function resolveLibraryRoot(): string {
  return path.join(os.homedir(), "Desktop", "fashion-asset-library");
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
