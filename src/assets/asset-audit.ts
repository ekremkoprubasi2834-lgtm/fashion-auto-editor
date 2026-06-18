// Audits collected section pools without a vision model (MVP). It relies on:
//   - folder membership (which section the file was placed in)
//   - file type + byte size
//   - pixel dimensions (premium content should not be tiny)
//   - exact-duplicate detection (sha256)        -> aliases / re-saved files
//   - near-duplicate detection (8x8 average hash) -> same shot, different crop
// "Distinct" counts collapse exact + near duplicates into one cluster, so a
// section padded with 25 copies of one photo will not pass the gate.

import {
  getSectionDefinition,
  type CandidateAsset,
  type SectionAssetPool,
  type SectionId
} from "./asset-source-provider.js";
import { hammingDistanceHex } from "./local-folder-provider.js";

const NEAR_DUPLICATE_DISTANCE = 5; // out of 64 bits
const MIN_PREMIUM_EDGE = 700; // px; below this a still reads as low-resolution

export interface DuplicateGroup {
  contentHash: string;
  files: string[];
}

export interface NearDuplicatePair {
  fileA: string;
  fileB: string;
  distance: number;
}

export interface SectionAuditResult {
  section: SectionId;
  displayTitle: string;
  minimum: number;
  derived: boolean;
  totalFiles: number;
  distinctCount: number;
  imageCount: number;
  videoCount: number;
  exactDuplicates: DuplicateGroup[];
  nearDuplicates: NearDuplicatePair[];
  lowResolution: string[];
  meetsMinimum: boolean;
  shortBy: number;
}

export interface AuditReport {
  generatedAt: string;
  baseDir: string;
  sections: SectionAuditResult[];
  totalDistinct: number;
  totalMinimum: number;
  renderAllowed: boolean;
  verdict: "READY" | "INSUFFICIENT_ASSETS";
}

export function auditSections(pools: SectionAssetPool[], baseDir: string): AuditReport {
  const sections = pools.map((pool) => auditSection(pool));

  // Render is allowed only when every non-derived section meets its minimum.
  const collectable = sections.filter((section) => !section.derived);
  const renderAllowed = collectable.every((section) => section.meetsMinimum);

  return {
    generatedAt: new Date().toISOString(),
    baseDir,
    sections,
    totalDistinct: sections.reduce((sum, section) => sum + section.distinctCount, 0),
    totalMinimum: sections.reduce((sum, section) => sum + section.minimum, 0),
    renderAllowed,
    verdict: renderAllowed ? "READY" : "INSUFFICIENT_ASSETS"
  };
}

function auditSection(pool: SectionAssetPool): SectionAuditResult {
  const definition = getSectionDefinition(pool.section);
  const candidates = pool.candidates;

  const exactDuplicates = findExactDuplicates(candidates);
  const nearDuplicates = findNearDuplicates(candidates);
  const distinctCount = countDistinct(candidates);
  const lowResolution = candidates
    .filter((candidate) => isLowResolution(candidate))
    .map((candidate) => candidate.filename);

  const meetsMinimum = distinctCount >= definition.minimum;

  return {
    section: pool.section,
    displayTitle: definition.displayTitle,
    minimum: definition.minimum,
    derived: definition.derived,
    totalFiles: candidates.length,
    distinctCount,
    imageCount: candidates.filter((candidate) => candidate.mediaType === "image").length,
    videoCount: candidates.filter((candidate) => candidate.mediaType === "video").length,
    exactDuplicates,
    nearDuplicates,
    lowResolution,
    meetsMinimum,
    shortBy: Math.max(0, definition.minimum - distinctCount)
  };
}

function findExactDuplicates(candidates: CandidateAsset[]): DuplicateGroup[] {
  const byHash = new Map<string, string[]>();
  for (const candidate of candidates) {
    if (!candidate.contentHash) {
      continue;
    }
    const list = byHash.get(candidate.contentHash) ?? [];
    list.push(candidate.filename);
    byHash.set(candidate.contentHash, list);
  }

  return [...byHash.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([contentHash, files]) => ({ contentHash, files }));
}

function findNearDuplicates(candidates: CandidateAsset[]): NearDuplicatePair[] {
  const pairs: NearDuplicatePair[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.contentHash && b.contentHash && a.contentHash === b.contentHash) {
        continue; // already an exact duplicate
      }
      const distance = hammingDistanceHex(a.perceptualHash, b.perceptualHash);
      if (distance !== null && distance <= NEAR_DUPLICATE_DISTANCE) {
        pairs.push({ fileA: a.filename, fileB: b.filename, distance });
      }
    }
  }
  return pairs;
}

// Union-find over exact-hash equality and near-duplicate adjacency. The number
// of resulting clusters is the count of visually distinct assets.
function countDistinct(candidates: CandidateAsset[]): number {
  const parent = candidates.map((_, index) => index);

  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) {
      root = parent[root];
    }
    let cursor = x;
    while (parent[cursor] !== root) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };

  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
    }
  };

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      const sameExact = a.contentHash && b.contentHash && a.contentHash === b.contentHash;
      const distance = hammingDistanceHex(a.perceptualHash, b.perceptualHash);
      const sameNear = distance !== null && distance <= NEAR_DUPLICATE_DISTANCE;
      if (sameExact || sameNear) {
        union(i, j);
      }
    }
  }

  const roots = new Set<number>();
  for (let i = 0; i < candidates.length; i += 1) {
    roots.add(find(i));
  }
  return roots.size;
}

function isLowResolution(candidate: CandidateAsset): boolean {
  if (candidate.mediaType !== "image" || candidate.width === null || candidate.height === null) {
    return false;
  }
  return Math.min(candidate.width, candidate.height) < MIN_PREMIUM_EDGE;
}

export function buildSectionPoolsDocument(report: AuditReport, pools: SectionAssetPool[]): unknown {
  const poolBySection = new Map<SectionId, SectionAssetPool>();
  for (const pool of pools) {
    poolBySection.set(pool.section, pool);
  }

  return {
    generatedAt: report.generatedAt,
    baseDir: report.baseDir,
    verdict: report.verdict,
    renderAllowed: report.renderAllowed,
    totals: { distinct: report.totalDistinct, minimum: report.totalMinimum },
    sections: report.sections.map((section) => ({
      section: section.section,
      displayTitle: section.displayTitle,
      minimum: section.minimum,
      derived: section.derived,
      totalFiles: section.totalFiles,
      distinctCount: section.distinctCount,
      meetsMinimum: section.meetsMinimum,
      shortBy: section.shortBy,
      imageCount: section.imageCount,
      videoCount: section.videoCount,
      exactDuplicateGroups: section.exactDuplicates.length,
      nearDuplicatePairs: section.nearDuplicates.length,
      lowResolutionCount: section.lowResolution.length,
      candidates: (poolBySection.get(section.section)?.candidates ?? []).map((candidate) => ({
        filename: candidate.filename,
        mediaType: candidate.mediaType,
        width: candidate.width,
        height: candidate.height,
        bytes: candidate.bytes,
        contentHash: candidate.contentHash ? candidate.contentHash.slice(0, 16) : null,
        perceptualHash: candidate.perceptualHash,
        flags: candidate.flags
      }))
    }))
  };
}

export function renderSufficiencyMarkdown(report: AuditReport): string {
  const lines: string[] = [
    "# Asset Sufficiency Report",
    "",
    `**Status: ${report.verdict}${report.renderAllowed ? "" : " — RENDER BLOCKED"}**`,
    "",
    `Generated: ${report.generatedAt}`,
    `Source: \`${report.baseDir}\``,
    `Method: folder membership + file type + dimensions + exact/near-duplicate hashing (no vision model).`,
    "",
    "## Per-section summary",
    "",
    "| Section | Distinct | Min | Files | Img | Vid | Exact dups | Near dups | Low-res | Status |",
    "|---|---|---|---|---|---|---|---|---|---|"
  ];

  for (const section of report.sections) {
    if (section.derived) {
      continue;
    }
    lines.push(
      `| ${section.displayTitle} | ${section.distinctCount} | ${section.minimum} | ${section.totalFiles} | ` +
        `${section.imageCount} | ${section.videoCount} | ${section.exactDuplicates.length} | ` +
        `${section.nearDuplicates.length} | ${section.lowResolution.length} | ` +
        `${section.meetsMinimum ? "OK" : `SHORT by ${section.shortBy}`} |`
    );
  }

  lines.push(
    "",
    `**Total distinct: ${report.totalDistinct} / ${report.totalMinimum} required.**`,
    `**Render allowed: ${report.renderAllowed ? "Yes" : "No"}.**`,
    ""
  );

  const short = report.sections.filter((section) => !section.derived && !section.meetsMinimum);
  if (short.length > 0) {
    lines.push("## Sections that block rendering", "");
    for (const section of short) {
      lines.push(
        `- **${section.displayTitle}**: ${section.distinctCount}/${section.minimum} ` +
          `(need ${section.shortBy} more distinct asset${section.shortBy === 1 ? "" : "s"}).`
      );
    }
    lines.push(
      "",
      "Open `output/search_links.md` for ready-to-click searches, download into the matching",
      "`Desktop/new-fashion-assets/<section>/` folder, then re-run `npm run assets:audit`.",
      ""
    );
  } else {
    lines.push(
      "All sections meet their minimum. Run `npm run assets:prepare` to copy them into `assets/`.",
      ""
    );
  }

  return lines.join("\n") + "\n";
}

export function renderDownloadRequirementsMarkdown(report: AuditReport): string {
  const lines: string[] = [
    "# Asset Download Requirements",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "What still has to be downloaded before the render gate opens. Each section below",
    "lists how many more distinct assets are needed and where to put them.",
    ""
  ];

  for (const section of report.sections) {
    if (section.derived) {
      continue;
    }
    const definition = getSectionDefinition(section.section);
    const status = section.meetsMinimum
      ? `OK (${section.distinctCount}/${section.minimum})`
      : `NEED ${section.shortBy} more (${section.distinctCount}/${section.minimum})`;
    lines.push(
      `## ${section.displayTitle} — ${status}`,
      "",
      `- Folder: \`Desktop/new-fashion-assets/${definition.importFolder}/\``,
      `- Example searches: ${definition.seedQueries.slice(0, 3).map((q) => `"${q}"`).join(", ")}`,
      ""
    );
  }

  lines.push(
    "## Outro / Recap",
    "",
    "- Not collected directly — it recaps one asset from each of the five items.",
    "- Becomes ready automatically once the five items above are ready.",
    ""
  );

  return lines.join("\n") + "\n";
}
