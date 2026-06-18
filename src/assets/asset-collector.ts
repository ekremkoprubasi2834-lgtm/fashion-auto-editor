// Orchestrator for the Visual Asset Finder. Exposes the three CLI entry points
// (queries / audit / prepare) and the render gate the dev pipeline consults
// before producing any video.
//
// MVP source strategy:
//   - LocalFolderProvider  : reads Desktop/new-fashion-assets/<section>/ (active)
//   - SearchLinkProvider   : emits where-to-look URLs (active)
//   - Pinterest / stock    : not implemented; the interfaces are ready for them.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../config.js";
import { readTextFile, writeTextFile } from "../utils/fs.js";
import {
  auditSections,
  buildSectionPoolsDocument,
  renderDownloadRequirementsMarkdown,
  renderSufficiencyMarkdown,
  type AuditReport
} from "./asset-audit.js";
import {
  COLLECTABLE_SECTIONS,
  type SectionAssetPool,
  type SectionId
} from "./asset-source-provider.js";
import {
  LocalFolderProvider,
  collectableSectionIds
} from "./local-folder-provider.js";
import { renderSearchLinksMarkdown, SearchLinkProvider } from "./search-link-provider.js";
import {
  buildSearchQueriesDocument,
  generateSectionQueries
} from "./search-query-generator.js";
import {
  isPreparedManifestSufficient,
  loadPreparedAssetManifest,
  PREPARED_ASSET_MANIFEST_PATH,
  type PreparedAssetManifest,
  type PreparedAssetManifestEntry
} from "./prepared-asset-manifest.js";

const SUPPORTED_ASSET_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function resolveNewAssetsDir(): string {
  return process.env.NEW_FASHION_ASSETS_DIR ?? path.join(os.homedir(), "Desktop", "new-fashion-assets");
}

// ---- npm run assets:queries ----
export async function runAssetQueries(): Promise<void> {
  const transcriptText = await readTranscriptIfPresent();
  const sectionQueries = generateSectionQueries(transcriptText);
  const document = buildSearchQueriesDocument(transcriptText);

  await writeTextFile(
    path.join(config.outputDir, "search_queries.json"),
    JSON.stringify(document, null, 2) + "\n"
  );
  await writeTextFile(
    path.join(config.outputDir, "search_links.md"),
    renderSearchLinksMarkdown(sectionQueries)
  );

  const totalQueries = sectionQueries.reduce((sum, section) => sum + section.queries.length, 0);
  console.log(`Generated ${totalQueries} search queries across ${sectionQueries.length} sections.`);
  console.log(`Wrote ${path.join(config.outputDir, "search_queries.json")}`);
  console.log(`Wrote ${path.join(config.outputDir, "search_links.md")}`);
}

// ---- npm run assets:audit ----
export async function runAssetAudit(): Promise<AuditReport> {
  const baseDir = resolveNewAssetsDir();
  const provider = new LocalFolderProvider(baseDir);
  const pools = await collectPools(provider);
  const report = auditSections(pools, baseDir);

  await writeReports(report, pools);

  if (!provider.isAvailable()) {
    console.warn(`Import folder not found: ${baseDir}`);
    console.warn("Create it (with intro/blusen/weisse-hosen/rocke/tops/westen subfolders) and add images.");
  }
  printAuditSummary(report);
  return report;
}

// ---- npm run assets:prepare ----
export async function runAssetPrepare(): Promise<void> {
  const baseDir = resolveNewAssetsDir();
  const provider = new LocalFolderProvider(baseDir);
  const pools = await collectPools(provider);
  const report = auditSections(pools, baseDir);

  await writeReports(report, pools);
  printAuditSummary(report);

  if (!report.renderAllowed) {
    console.error("INSUFFICIENT_ASSETS — render blocked.");
    console.error("Not copying anything into assets/. See output/asset_sufficiency_report.md.");
    process.exitCode = 1;
    return;
  }

  const { prepared, manifest } = preparePools(pools, "assets", baseDir);
  await writePreparedManifest(manifest);
  console.log(`Prepared ${prepared} distinct assets into assets/ with section prefixes.`);
  console.log(`Wrote ${PREPARED_ASSET_MANIFEST_PATH}`);
  console.log("Assets are ready. The render gate will now allow `npm run dev`.");
}

// ---- render gate (consulted by the dev pipeline) ----
export interface RenderGateSection {
  section: SectionId;
  displayTitle: string;
  count: number;
  minimum: number;
  met: boolean;
}

export interface RenderGateResult {
  renderAllowed: boolean;
  sections: RenderGateSection[];
  totalCount: number;
  totalMinimum: number;
  blockingReason: string | null;
}

// Gate is evaluated against the latest prepared manifest, not a free scan of
// assets/. This keeps stale prefixed files out of the render pool.
export function evaluateRenderGate(assetsDir: string): RenderGateResult {
  const loaded = loadPreparedAssetManifest();

  if (!loaded.ok) {
    const sections = COLLECTABLE_SECTIONS.map<RenderGateSection>((definition) => ({
      section: definition.id,
      displayTitle: definition.displayTitle,
      count: 0,
      minimum: definition.minimum,
      met: false
    }));
    return {
      renderAllowed: false,
      sections,
      totalCount: 0,
      totalMinimum: sections.reduce((sum, section) => sum + section.minimum, 0),
      blockingReason: `${loaded.code} — ${loaded.reason}`
    };
  }

  const manifest = loaded.manifest;

  const sections = COLLECTABLE_SECTIONS.map<RenderGateSection>((definition) => {
    const count = manifest.sections[definition.id]?.count ?? 0;
    return {
      section: definition.id,
      displayTitle: definition.displayTitle,
      count,
      minimum: definition.minimum,
      met: count >= definition.minimum
    };
  });

  return {
    renderAllowed: isPreparedManifestSufficient(manifest),
    sections,
    totalCount: sections.reduce((sum, section) => sum + section.count, 0),
    totalMinimum: sections.reduce((sum, section) => sum + section.minimum, 0),
    blockingReason: sections.every((section) => section.met)
      ? null
      : "PREPARED_ASSET_MANIFEST_INSUFFICIENT — prepared asset manifest does not meet section minimums."
  };
}

export function describeRenderGate(result: RenderGateResult): string[] {
  const lines = result.sections.map(
    (section) =>
      `  ${section.met ? "OK  " : "MISS"} ${section.displayTitle}: ${section.count}/${section.minimum}`
  );
  lines.push(`  total: ${result.totalCount}/${result.totalMinimum}`);
  return lines;
}

// ---- internals ----

async function collectPools(provider: LocalFolderProvider): Promise<SectionAssetPool[]> {
  const candidates = await provider.collect(collectableSectionIds());

  return COLLECTABLE_SECTIONS.map<SectionAssetPool>((definition) => ({
    section: definition.id,
    minimum: definition.minimum,
    candidates: candidates.filter((candidate) => candidate.section === definition.id)
  }));
}

async function writeReports(report: AuditReport, pools: SectionAssetPool[]): Promise<void> {
  await writeTextFile(
    path.join(config.outputDir, "section_asset_pools.json"),
    JSON.stringify(buildSectionPoolsDocument(report, pools), null, 2) + "\n"
  );
  await writeTextFile(
    path.join(config.outputDir, "asset_sufficiency_report.md"),
    renderSufficiencyMarkdown(report)
  );
  await writeTextFile(
    path.join(config.outputDir, "asset_download_requirements.md"),
    renderDownloadRequirementsMarkdown(report)
  );
}

function printAuditSummary(report: AuditReport): void {
  console.log(`Audit verdict: ${report.verdict} (distinct ${report.totalDistinct}/${report.totalMinimum}).`);
  for (const section of report.sections) {
    if (section.derived) {
      continue;
    }
    console.log(
      `  ${section.meetsMinimum ? "OK  " : "SHORT"} ${section.displayTitle}: ` +
        `${section.distinctCount}/${section.minimum}`
    );
  }
}

// Copies one representative per distinct (exact + near) cluster into assets/.
// Only reached when the audit already declared the pools sufficient.
function preparePools(
  pools: SectionAssetPool[],
  assetsDir: string,
  sourceBaseDir: string
): { prepared: number; manifest: PreparedAssetManifest } {
  fs.mkdirSync(assetsDir, { recursive: true });
  const existingHashes = new Set<string>();
  let prepared = 0;
  const sections = Object.fromEntries(
    COLLECTABLE_SECTIONS.map((definition) => [
      definition.id,
      { minimum: definition.minimum, count: 0, files: [] as PreparedAssetManifestEntry[] }
    ])
  ) as PreparedAssetManifest["sections"];

  for (const pool of pools) {
    const definition = COLLECTABLE_SECTIONS.find((candidate) => candidate.id === pool.section);
    if (!definition) {
      continue;
    }

    const seenHashes = new Set<string>();
    let sequence = 0;

    for (const candidate of pool.candidates) {
      if (candidate.mediaType !== "image" || !candidate.absolutePath) {
        continue;
      }
      const hash = candidate.contentHash ?? candidate.absolutePath;
      if (seenHashes.has(hash) || existingHashes.has(hash)) {
        continue;
      }
      seenHashes.add(hash);
      existingHashes.add(hash);

      sequence += 1;
      const extension = path.extname(candidate.filename).toLowerCase();
      const safeExtension = SUPPORTED_ASSET_EXTENSIONS.has(extension) ? extension : ".jpg";
      const destName = `${definition.namePrefix}-${String(sequence).padStart(3, "0")}${safeExtension}`;
      const destPath = path.join(assetsDir, destName);
      fs.copyFileSync(candidate.absolutePath, destPath);
      sections[definition.id].files.push({
        section: definition.id,
        displayTitle: definition.displayTitle,
        filename: destName,
        path: destPath,
        sourcePath: candidate.absolutePath,
        contentHash: candidate.contentHash,
        bytes: candidate.bytes
      });
      sections[definition.id].count = sections[definition.id].files.length;
      prepared += 1;
    }
  }

  return {
    prepared,
    manifest: {
      generatedAt: new Date().toISOString(),
      assetsDir,
      sourceBaseDir,
      total: prepared,
      sections
    }
  };
}

async function writePreparedManifest(manifest: PreparedAssetManifest): Promise<void> {
  await writeTextFile(PREPARED_ASSET_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  const lines = [
    "# Prepared Asset Manifest",
    "",
    `Generated: ${manifest.generatedAt}`,
    `Assets dir: \`${manifest.assetsDir}\``,
    `Source: \`${manifest.sourceBaseDir}\``,
    `Total: ${manifest.total}`,
    "",
    "| Section | Count | Minimum |",
    "|---|---:|---:|"
  ];

  for (const definition of COLLECTABLE_SECTIONS) {
    lines.push(`| ${definition.displayTitle} | ${manifest.sections[definition.id].count} | ${definition.minimum} |`);
  }
  lines.push("");
  await writeTextFile(path.join("output", "prepared_asset_manifest.md"), lines.join("\n"));
}

function listRealAssets(assetsDir: string): string[] {
  if (!fs.existsSync(assetsDir)) {
    return [];
  }
  return fs
    .readdirSync(assetsDir)
    .filter((name) => SUPPORTED_ASSET_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .filter((name) => !name.startsWith("scene-"));
}

async function readTranscriptIfPresent(): Promise<string | undefined> {
  try {
    return await readTextFile(config.inputTranscriptPath);
  } catch {
    return undefined;
  }
}
