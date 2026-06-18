import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { config } from "../../config.js";
import { writeTextFile } from "../../utils/fs.js";
import type { SectionId } from "../asset-source-provider.js";
import { downloadCandidate } from "./download-candidate.js";
import {
  buildMoodboardSearchQueries,
  collectableMoodboardSections,
  pinterestSearchUrl,
  renderMoodboardLinksMarkdown
} from "./fashion-search-links.js";
import type {
  MoodboardCandidate,
  MoodboardCollectOptions,
  MoodboardCollectResult
} from "./fashion-moodboard-types.js";
import {
  isPinterestImageUrl,
  normalizePinimgUrl,
  pinimgDedupeKey
} from "./pinimg-utils.js";

const SCROLL_ROUNDS = 8;
const SCROLL_WAIT_MS = 1200;
const DEFAULT_LIMIT = 40;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type BrowserModule = {
  chromium: {
    launch(options: { headless: boolean; slowMo: number; channel?: string }): Promise<Browser>;
  };
};

type Browser = {
  newContext(options: {
    userAgent: string;
    viewport: { width: number; height: number };
    locale: string;
    extraHTTPHeaders: Record<string, string>;
  }): Promise<BrowserContext>;
  close(): Promise<void>;
};

type BrowserContext = {
  newPage(): Promise<Page>;
};

type Page = {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
  waitForSelector(selector: string, options: { timeout: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  url(): string;
};

interface HarvestedImage {
  originalImageUrl: string;
  normalizedImageUrl: string;
  sourcePageUrl: string;
}

export async function runMoodboardLinks(): Promise<void> {
  await writeTextFile(path.join(config.outputDir, "moodboard_search_links.md"), renderMoodboardLinksMarkdown());
  console.log(`Wrote ${path.join(config.outputDir, "moodboard_search_links.md")}`);
}

export async function runMoodboardCollect(args: string[]): Promise<void> {
  const options = parseMoodboardCollectOptions(args);
  const result = await collectFashionMoodboard(options);

  await writeTextFile(
    path.join(config.outputDir, "moodboard_candidates.json"),
    JSON.stringify(buildCollectDocument(result), null, 2) + "\n"
  );
  if (result.download) {
    fs.mkdirSync(result.stagingRoot, { recursive: true });
    fs.writeFileSync(
      path.join(result.stagingRoot, "moodboard_candidates.json"),
      JSON.stringify(buildCollectDocument(result), null, 2) + "\n"
    );
  }
  await writeTextFile(path.join(config.outputDir, "moodboard_collect_report.md"), renderCollectReport(result));

  const downloaded = result.candidates.filter((candidate) => candidate.status === "downloaded").length;
  console.log(`Moodboard collect (${result.download ? "download" : "dry-run"}):`);
  console.log(`  Candidates: ${result.candidates.length}`);
  console.log(`  Downloaded: ${downloaded}`);
  console.log(`  Staging root: ${result.stagingRoot}`);
  console.log(`Wrote ${path.join(config.outputDir, "moodboard_candidates.json")}`);
  console.log(`Wrote ${path.join(config.outputDir, "moodboard_collect_report.md")}`);
}

function buildCollectDocument(result: MoodboardCollectResult): unknown {
  return {
    generatedAt: result.generatedAt,
    runId: result.runId,
    mode: result.download ? "download" : "dry-run",
    stagingRoot: result.stagingRoot,
    total: result.candidates.length,
    candidates: result.candidates
  };
}

export async function collectFashionMoodboard(options: MoodboardCollectOptions): Promise<MoodboardCollectResult> {
  const runId = buildRunId();
  const stagingRoot = path.join(os.homedir(), "Desktop", "fashion-asset-library", "staging", runId);
  const queries = buildMoodboardSearchQueries(options.sections);
  const playwright = await loadPlaywright();
  const browser = await launchVisibleBrowser(playwright);
  const candidates: MoodboardCandidate[] = [];

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" }
    });
    const page = await context.newPage();

    console.log("Visible Chromium opened for Pinterest collection.");
    console.log("Pinterest login gerekiyorsa tarayıcıda giriş yap, sonra Enter'a bas.");
    await waitForEnter("Devam etmek için Enter'a basın: ");

    for (const section of options.sections) {
      const sectionQueries = queries.filter((query) => query.section === section);
      const seen = new Map<string, HarvestedImage>();

      for (const { query } of sectionQueries) {
        if (seen.size >= options.limit) {
          break;
        }
        const harvested = await collectQueryImages(page, query, options.limit - seen.size);
        for (const image of harvested) {
          const key = pinimgDedupeKey(image.normalizedImageUrl);
          if (!seen.has(key)) {
            seen.set(key, image);
          }
          if (seen.size >= options.limit) {
            break;
          }
        }
      }

      let index = 0;
      for (const image of seen.values()) {
        index += 1;
        const query = findQueryForPage(sectionQueries.map((item) => item.query), image.sourcePageUrl);
        const base: MoodboardCandidate = {
          provider: "pinterest-browser",
          section,
          query,
          originalImageUrl: image.originalImageUrl,
          normalizedImageUrl: image.normalizedImageUrl,
          sourcePageUrl: image.sourcePageUrl,
          downloadedPath: null,
          status: options.download ? "skipped-no-download" : "seen",
          bytes: null,
          contentType: null,
          createdAt: new Date().toISOString()
        };

        if (!options.download) {
          candidates.push(base);
          continue;
        }

        const destDir = path.join(stagingRoot, section);
        const outcome = await downloadCandidate({
          section,
          source: "pinterest",
          normalizedImageUrl: image.normalizedImageUrl,
          index,
          destDir
        });
        candidates.push({
          ...base,
          downloadedPath: outcome.downloadedPath,
          status: outcome.status,
          bytes: outcome.bytes,
          contentType: outcome.contentType
        });
      }
    }
  } finally {
    await browser.close();
  }

  return {
    generatedAt: new Date().toISOString(),
    runId,
    download: options.download,
    stagingRoot,
    candidates
  };
}

async function collectQueryImages(page: Page, query: string, remaining: number): Promise<HarvestedImage[]> {
  const url = pinterestSearchUrl(query);
  console.log(`Searching Pinterest: ${query}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
  await page.waitForSelector('img[src*="pinimg.com"]', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(1200);

  const seen = new Map<string, HarvestedImage>();
  await harvestPageImages(page, seen);

  for (let round = 0; round < SCROLL_ROUNDS && seen.size < remaining; round += 1) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(SCROLL_WAIT_MS);
    await harvestPageImages(page, seen);
  }

  return [...seen.values()].slice(0, remaining);
}

async function harvestPageImages(page: Page, seen: Map<string, HarvestedImage>): Promise<void> {
  const sourcePageUrl = page.url();
  const urls = await page.evaluate(() => {
    const out = new Set<string>();
    document.querySelectorAll("img").forEach((img) => {
      if (img.src) {
        out.add(img.src);
      }
      for (const part of (img.srcset || "").split(",")) {
        const url = part.trim().split(/\s+/)[0];
        if (url) {
          out.add(url);
        }
      }
    });
    return [...out];
  });

  for (const originalImageUrl of urls) {
    if (!isPinterestImageUrl(originalImageUrl)) {
      continue;
    }
    const normalizedImageUrl = normalizePinimgUrl(originalImageUrl);
    const key = pinimgDedupeKey(normalizedImageUrl);
    if (!seen.has(key)) {
      seen.set(key, { originalImageUrl, normalizedImageUrl, sourcePageUrl });
    }
  }
}

function parseMoodboardCollectOptions(args: string[]): MoodboardCollectOptions {
  const section = readArgValue(args, "--section") as SectionId | undefined;
  const all = args.includes("--all");
  const limitValue = readArgValue(args, "--limit");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : DEFAULT_LIMIT;
  const sections = all || !section ? collectableMoodboardSections() : [section];

  validateSections(sections);
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("--limit must be a positive number.");
  }

  return {
    sections,
    limit,
    download: args.includes("--download")
  };
}

function validateSections(sections: SectionId[]): void {
  const allowed = new Set(collectableMoodboardSections());
  for (const section of sections) {
    if (!allowed.has(section)) {
      throw new Error(`Unsupported section "${section}". Use one of: ${[...allowed].join(", ")}`);
    }
  }
}

function readArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function waitForEnter(prompt: string): Promise<void> {
  if (!process.stdin.isTTY) {
    return Promise.resolve();
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function loadPlaywright(): Promise<BrowserModule> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<BrowserModule>;
    return await dynamicImport("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run `npm install` before using moodboard:collect.");
  }
}

async function launchVisibleBrowser(playwright: BrowserModule): Promise<Browser> {
  try {
    return await playwright.chromium.launch({ headless: false, slowMo: 40 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Executable doesn't exist")) {
      throw error;
    }
  }

  try {
    return await playwright.chromium.launch({ headless: false, slowMo: 40, channel: "chrome" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      "No Playwright Chromium browser is available, and system Chrome could not be launched. " +
        `Collector not run. Detail: ${message}`
    );
  }
}

function findQueryForPage(queries: string[], sourcePageUrl: string): string {
  for (const query of queries) {
    if (sourcePageUrl.includes(encodeURIComponent(query))) {
      return query;
    }
  }
  return queries[0] ?? "";
}

function buildRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

function renderCollectReport(result: MoodboardCollectResult): string {
  const lines = [
    "# Fashion Moodboard Collect Report",
    "",
    `Generated: ${result.generatedAt}`,
    `Run ID: ${result.runId}`,
    `Mode: ${result.download ? "download" : "dry-run"}`,
    `Staging root: \`${result.stagingRoot}\``,
    "",
    "## Totals",
    "",
    `- Candidates: ${result.candidates.length}`,
    `- Downloaded: ${result.candidates.filter((candidate) => candidate.status === "downloaded").length}`,
    `- Failed/skipped: ${result.candidates.filter((candidate) => candidate.status !== "seen" && candidate.status !== "downloaded").length}`,
    "",
    "## Per-section",
    "",
    "| Section | Candidates | Downloaded |",
    "|---|---:|---:|"
  ];

  for (const section of collectableMoodboardSections()) {
    const sectionCandidates = result.candidates.filter((candidate) => candidate.section === section);
    if (sectionCandidates.length === 0) {
      continue;
    }
    lines.push(
      `| ${section} | ${sectionCandidates.length} | ` +
        `${sectionCandidates.filter((candidate) => candidate.status === "downloaded").length} |`
    );
  }

  lines.push(
    "",
    "## Next steps",
    "",
    "Collector output is only a staging candidate set. It does not unlock rendering.",
    "",
    "1. `npm run library:scan`",
    "2. `npm run library:audit`",
    "3. `npm run assets:audit`",
    "4. `npm run assets:prepare`",
    "",
    "If library scan/audit commands are not implemented yet, keep using the existing `npm run assets:audit` workflow.",
    ""
  );

  return lines.join("\n");
}
