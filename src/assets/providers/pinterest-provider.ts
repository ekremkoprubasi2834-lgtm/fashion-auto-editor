// Pinterest "Board Mode" connector (MVP).
//
// Reads boards + pins through the official Pinterest v5 REST API using a Bearer
// access token. No passwords, cookies, sessions, or scraping. The provider only
// reads; downloading candidate media into the local import folders is an opt-in
// step driven by the CLI runners at the bottom of this file.

import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeTextFile } from "../../utils/fs.js";
import { resolveNewAssetsDir } from "../asset-collector.js";
import {
  COLLECTABLE_SECTIONS,
  getSectionDefinition,
  type CandidateAsset,
  type CollectingProvider,
  type MediaType,
  type SectionId
} from "../asset-source-provider.js";
import { buildAuthorizeUrl, exchangeCodeForToken } from "./pinterest-oauth.js";
import {
  loadBoardConfig,
  mapBoardNameToSection,
  type LoadedBoardConfig
} from "./pinterest-board-mapper.js";
import {
  maskToken,
  readPinterestEnv,
  type NormalizedPin,
  type PinterestBoard,
  type PinterestEnvConfig,
  type PinterestImageVariant,
  type PinterestMedia,
  type PinterestPagedResponse,
  type PinterestPin
} from "./pinterest-types.js";

const TOKEN_MISSING_MESSAGE =
  "Pinterest token missing. Run pinterest:auth or set PINTEREST_ACCESS_TOKEN.";
const PAGE_SIZE = 100;
const MAX_PAGES = 50; // safety stop for pagination loops
const BOARD_CONFIG_PATH = path.join("config", "pinterest-boards.json");
const BOARD_CONFIG_EXAMPLE_PATH = path.join("config", "pinterest-boards.example.json");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);

export class PinterestProvider implements CollectingProvider {
  readonly id = "pinterest";
  readonly kind = "remote" as const;

  constructor(
    private readonly env: PinterestEnvConfig,
    private readonly boardConfig: LoadedBoardConfig | null = null
  ) {}

  isAvailable(): boolean {
    return this.env.accessToken.length > 0;
  }

  private requireToken(): void {
    if (!this.isAvailable()) {
      throw new Error(TOKEN_MISSING_MESSAGE);
    }
  }

  // GET a single page from the v5 API. Adds the Bearer token; never echoes it.
  private async getPage<T>(
    pathname: string,
    query: Record<string, string | number>
  ): Promise<PinterestPagedResponse<T>> {
    const url = new URL(`${this.env.apiBaseUrl}${pathname}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.env.accessToken}`, Accept: "application/json" }
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Pinterest request to ${pathname} failed: ${reason}`);
    }

    if (response.status === 401) {
      throw new Error(
        "Pinterest token rejected (HTTP 401). It may be expired — re-run pinterest:auth or refresh PINTEREST_ACCESS_TOKEN."
      );
    }
    if (!response.ok) {
      const detail = await safeReadErrorDetail(response);
      throw new Error(`Pinterest GET ${pathname} failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}.`);
    }

    return (await response.json()) as PinterestPagedResponse<T>;
  }

  // Walks the `bookmark` cursor until exhausted (or the safety cap).
  private async getAll<T>(pathname: string, query: Record<string, string | number>): Promise<T[]> {
    const items: T[] = [];
    let bookmark: string | null | undefined;
    let pages = 0;

    do {
      const page = await this.getPage<T>(pathname, bookmark ? { ...query, bookmark } : query);
      if (page.items?.length) {
        items.push(...page.items);
      }
      bookmark = page.bookmark ?? null;
      pages += 1;
    } while (bookmark && pages < MAX_PAGES);

    return items;
  }

  async listBoards(): Promise<PinterestBoard[]> {
    this.requireToken();
    return this.getAll<PinterestBoard>("/boards", { page_size: PAGE_SIZE });
  }

  async listPins(boardId: string, section: SectionId): Promise<NormalizedPin[]> {
    this.requireToken();
    const raw = await this.getAll<PinterestPin>(`/boards/${encodeURIComponent(boardId)}/pins`, {
      page_size: PAGE_SIZE
    });
    return raw.map((pin) => normalizePin(pin, boardId, section));
  }

  // Pulls every configured board for the requested sections into normalized pins.
  async collectNormalizedPins(sections: SectionId[]): Promise<NormalizedPin[]> {
    this.requireToken();
    if (!this.boardConfig) {
      throw new Error(
        `Board config not loaded. Provide config/pinterest-boards.json (see ${BOARD_CONFIG_EXAMPLE_PATH}).`
      );
    }

    const wanted = new Set(sections);
    const pins: NormalizedPin[] = [];

    for (const [section, boardIds] of Object.entries(this.boardConfig.bySection) as [SectionId, string[]][]) {
      if (!wanted.has(section)) {
        continue;
      }
      for (const boardId of boardIds) {
        const boardPins = await this.listPins(boardId, section);
        pins.push(...boardPins);
      }
    }

    return pins;
  }

  // CollectingProvider contract: normalized pins adapted to CandidateAsset so the
  // existing audit/pool machinery can consume Pinterest results later.
  async collect(sections: SectionId[]): Promise<CandidateAsset[]> {
    const pins = await this.collectNormalizedPins(sections);
    const sequence = new Map<SectionId, number>();

    return pins.map((pin) => {
      const index = (sequence.get(pin.section) ?? 0) + 1;
      sequence.set(pin.section, index);
      return pinToCandidate(pin, index);
    });
  }
}

// ---- normalization helpers ----

function normalizePin(pin: PinterestPin, boardId: string, section: SectionId): NormalizedPin {
  const media: PinterestMedia = pin.media ?? {};
  const mediaType: MediaType = media.media_type?.toLowerCase() === "video" ? "video" : "image";
  const bestImage = pickBestImage(media.images);

  return {
    provider: "pinterest",
    pinId: pin.id,
    boardId: pin.board_id ?? boardId,
    section,
    title: (pin.title ?? pin.alt_text ?? "").trim(),
    description: (pin.description ?? "").trim(),
    link: pin.link ?? null,
    mediaType,
    imageUrl: bestImage?.url ?? null,
    videoUrl: media.video_url ?? (mediaType === "video" ? media.url ?? null : null),
    sourceUrl: pin.link ?? null,
    width: bestImage?.width ?? null,
    height: bestImage?.height ?? null
  };
}

function pickBestImage(
  images: Record<string, PinterestImageVariant> | undefined
): PinterestImageVariant | null {
  if (!images) {
    return null;
  }

  const originals = images.originals;
  if (originals?.url) {
    return originals;
  }

  let best: PinterestImageVariant | null = null;
  for (const variant of Object.values(images)) {
    if (!variant?.url) {
      continue;
    }
    if (!best || (variant.width ?? 0) > (best.width ?? 0)) {
      best = variant;
    }
  }
  return best;
}

function pinToCandidate(pin: NormalizedPin, index: number): CandidateAsset {
  const url = pin.mediaType === "video" ? pin.videoUrl ?? pin.imageUrl : pin.imageUrl;
  const extension = mediaExtension(url, pin.mediaType);
  return {
    section: pin.section,
    providerId: "pinterest",
    absolutePath: null,
    sourceUrl: url ?? pin.sourceUrl,
    filename: safeAssetName(pin, index, extension),
    mediaType: pin.mediaType,
    extension,
    bytes: null,
    width: pin.width,
    height: pin.height,
    contentHash: null,
    perceptualHash: null,
    flags: pin.imageUrl || pin.videoUrl ? [] : ["no-media-url"]
  };
}

function safeAssetName(pin: NormalizedPin, index: number, extension: string): string {
  const safePinId = pin.pinId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `pinterest-${pin.section}-${safePinId}-${String(index).padStart(2, "0")}${extension}`;
}

function mediaExtension(url: string | null | undefined, mediaType: MediaType): string {
  if (url) {
    try {
      const pathname = new URL(url).pathname;
      const ext = path.extname(pathname).toLowerCase();
      if (mediaType === "video" && VIDEO_EXTENSIONS.has(ext)) {
        return ext;
      }
      if (mediaType !== "video" && IMAGE_EXTENSIONS.has(ext)) {
        return ext;
      }
    } catch {
      // fall through to default
    }
  }
  return mediaType === "video" ? ".mp4" : ".jpg";
}

async function safeReadErrorDetail(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    if (!text) {
      return null;
    }
    try {
      const parsed = JSON.parse(text) as { message?: string; error_description?: string; error?: string };
      return parsed.message ?? parsed.error_description ?? parsed.error ?? text.slice(0, 200);
    } catch {
      return text.slice(0, 200);
    }
  } catch {
    return null;
  }
}

// ---- download ----

interface DownloadOutcome {
  filename: string;
  section: SectionId;
  status: "downloaded" | "skipped-exists" | "skipped-no-url" | "error";
  bytes: number;
  error?: string;
}

async function downloadCandidate(candidate: CandidateAsset, destDir: string): Promise<DownloadOutcome> {
  if (!candidate.sourceUrl) {
    return { filename: candidate.filename, section: candidate.section, status: "skipped-no-url", bytes: 0 };
  }

  const destPath = path.join(destDir, candidate.filename);
  if (fs.existsSync(destPath)) {
    return { filename: candidate.filename, section: candidate.section, status: "skipped-exists", bytes: 0 };
  }

  try {
    const response = await fetch(candidate.sourceUrl);
    if (!response.ok) {
      return {
        filename: candidate.filename,
        section: candidate.section,
        status: "error",
        bytes: 0,
        error: `HTTP ${response.status}`
      };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(destPath, buffer);
    return { filename: candidate.filename, section: candidate.section, status: "downloaded", bytes: buffer.length };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { filename: candidate.filename, section: candidate.section, status: "error", bytes: 0, error: reason };
  }
}

// ---- CLI runners (wired into src/cli.ts) ----

// npm run pinterest:auth [-- --code <CODE>]
export async function runPinterestAuth(code?: string): Promise<void> {
  const env = readPinterestEnv();
  const { url, state } = buildAuthorizeUrl(env);

  if (!code) {
    console.log("Pinterest OAuth — Authorization Code flow (manual MVP).\n");
    console.log("1. Open this URL in your browser and approve access:\n");
    console.log(url);
    console.log(`\n   (state=${state} — must match on return)`);
    console.log("\n2. After approving you are redirected to your PINTEREST_REDIRECT_URI with a");
    console.log("   `?code=...` query parameter. Copy that code and run:\n");
    console.log("   npm run pinterest:auth -- --code <CODE>\n");
    console.log("Tokens are NOT printed to the terminal; the exchange writes them to a");
    console.log("gitignored file you copy into .env yourself.");
    return;
  }

  const token = await exchangeCodeForToken(env, code);
  const tokenFile = path.join(config.outputDir, "pinterest_token.json");
  await writeTextFile(tokenFile, JSON.stringify(token, null, 2) + "\n");

  console.log("Token exchange succeeded.");
  console.log(`  access_token:  ${maskToken(token.access_token)}`);
  console.log(`  refresh_token: ${maskToken(token.refresh_token ?? "")}`);
  if (token.scope) {
    console.log(`  scope:         ${token.scope}`);
  }
  if (typeof token.expires_in === "number") {
    console.log(`  expires_in:    ${token.expires_in}s`);
  }
  console.log(`\nFull token written to ${tokenFile} (this file is gitignored — it contains secrets).`);
  console.log("Copy the values into .env as PINTEREST_ACCESS_TOKEN / PINTEREST_REFRESH_TOKEN, then delete it.");
}

interface BoardListing {
  id: string;
  name: string;
  suggestedSection: SectionId | null;
}

// npm run pinterest:boards
export async function runPinterestBoards(): Promise<void> {
  const env = readPinterestEnv();
  const provider = new PinterestProvider(env);
  const boards = await provider.listBoards();

  const listing: BoardListing[] = boards.map((board) => ({
    id: board.id,
    name: board.name,
    suggestedSection: mapBoardNameToSection(board.name)
  }));

  await writeTextFile(
    path.join(config.outputDir, "pinterest_boards.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), count: listing.length, boards: listing }, null, 2) + "\n"
  );

  console.log(`Found ${listing.length} board${listing.length === 1 ? "" : "s"}:`);
  for (const board of listing) {
    const suggestion = board.suggestedSection ? `  -> ${board.suggestedSection}` : "  -> (no section guess)";
    console.log(`  [${board.id}] ${board.name}${suggestion}`);
  }
  console.log(`\nWrote ${path.join(config.outputDir, "pinterest_boards.json")}`);
  console.log("Map these IDs into config/pinterest-boards.json (copy from the .example.json).");
}

export interface PinterestCollectOptions {
  download: boolean;
}

// npm run pinterest:collect [-- --download]
export async function runPinterestCollect(options: PinterestCollectOptions): Promise<void> {
  const env = readPinterestEnv();
  if (!env.accessToken) {
    throw new Error(TOKEN_MISSING_MESSAGE);
  }

  const boardConfig = loadBoardConfig(BOARD_CONFIG_PATH, BOARD_CONFIG_EXAMPLE_PATH);
  const provider = new PinterestProvider(env, boardConfig);

  const sections = COLLECTABLE_SECTIONS.map((definition) => definition.id);
  const candidates = await provider.collect(sections);

  await writeTextFile(
    path.join(config.outputDir, "pinterest_candidates.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: options.download ? "download" : "dry-run",
        total: candidates.length,
        candidates
      },
      null,
      2
    ) + "\n"
  );

  const outcomes: DownloadOutcome[] = [];
  if (options.download) {
    for (const candidate of candidates) {
      const definition = getSectionDefinition(candidate.section);
      if (!definition.importFolder) {
        continue;
      }
      const destDir = path.join(resolveNewAssetsDir(), definition.importFolder);
      outcomes.push(await downloadCandidate(candidate, destDir));
    }
  }

  const reportPath = path.join(config.outputDir, "pinterest_collect_report.md");
  await writeTextFile(reportPath, renderCollectReport(candidates, outcomes, options));

  printCollectSummary(candidates, outcomes, options, reportPath);
}

function printCollectSummary(
  candidates: CandidateAsset[],
  outcomes: DownloadOutcome[],
  options: PinterestCollectOptions,
  reportPath: string
): void {
  console.log(`Pinterest collect (${options.download ? "download" : "dry-run"}):`);
  console.log(`  Candidates found: ${candidates.length}`);
  if (options.download) {
    const downloaded = outcomes.filter((o) => o.status === "downloaded").length;
    const skipped = outcomes.filter((o) => o.status.startsWith("skipped")).length;
    const errors = outcomes.filter((o) => o.status === "error").length;
    console.log(`  Downloaded: ${downloaded}  Skipped: ${skipped}  Errors: ${errors}`);
  } else {
    console.log("  Dry-run: no files downloaded. Re-run with `-- --download` to fetch media.");
  }
  console.log(`Wrote ${path.join(config.outputDir, "pinterest_candidates.json")}`);
  console.log(`Wrote ${reportPath}`);
  console.log("Next: run `npm run assets:audit` to re-evaluate the render gate.");
}

function renderCollectReport(
  candidates: CandidateAsset[],
  outcomes: DownloadOutcome[],
  options: PinterestCollectOptions
): string {
  const lines: string[] = [
    "# Pinterest Collect Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Mode: ${options.download ? "download" : "dry-run"}`,
    "",
    "## Totals",
    "",
    `- Pins / candidates found: ${candidates.length}`,
    `- Media URLs found: ${candidates.filter((c) => c.sourceUrl).length}`
  ];

  if (options.download) {
    lines.push(
      `- Files downloaded: ${outcomes.filter((o) => o.status === "downloaded").length}`,
      `- Skipped (already present): ${outcomes.filter((o) => o.status === "skipped-exists").length}`,
      `- Skipped (no media URL): ${outcomes.filter((o) => o.status === "skipped-no-url").length}`,
      `- Errors: ${outcomes.filter((o) => o.status === "error").length}`
    );
  }
  lines.push("");

  lines.push("## Per-section", "", "| Section | Min | Candidates | Downloaded | Still needed (approx) |", "|---|---|---|---|---|");
  for (const definition of COLLECTABLE_SECTIONS) {
    const sectionCandidates = candidates.filter((c) => c.section === definition.id).length;
    const downloaded = outcomes.filter((o) => o.section === definition.id && o.status === "downloaded").length;
    const reference = options.download ? downloaded : sectionCandidates;
    const stillNeeded = Math.max(0, definition.minimum - reference);
    lines.push(
      `| ${definition.displayTitle} | ${definition.minimum} | ${sectionCandidates} | ${downloaded} | ${stillNeeded} |`
    );
  }
  lines.push("");

  const errors = outcomes.filter((o) => o.status === "error");
  if (errors.length > 0) {
    lines.push("## Download errors", "");
    for (const outcome of errors) {
      lines.push(`- \`${outcome.filename}\` (${outcome.section}): ${outcome.error ?? "unknown error"}`);
    }
    lines.push("");
  }

  lines.push(
    "## Asset gate",
    "",
    "Candidate counts are not the same as *distinct* assets. After downloading, run",
    "`npm run assets:audit` — it dedupes (exact + near) and checks each section against",
    "its minimum (intro 15; blusen/weisse_hosen/rocke/tops/westen 25; total 140). The",
    "render gate stays blocked until every section meets its minimum.",
    ""
  );

  return lines.join("\n") + "\n";
}
