// Maps Pinterest boards onto the seven canonical sections.
//
// Two strategies, in priority order:
//   1. Explicit config (config/pinterest-boards.json): section -> [boardId,...].
//      Authoritative — the user pins exactly which boards feed which section.
//   2. Board-name heuristic: keyword match on the board title. Used by
//      `pinterest:boards` to suggest a mapping when no config exists yet.

import fs from "node:fs";
import {
  COLLECTABLE_SECTIONS,
  type SectionId
} from "../asset-source-provider.js";

export type BoardSectionConfig = Partial<Record<SectionId, string[]>>;

// Board-name keywords per collectable section (lower-cased substring match).
const SECTION_NAME_HINTS: Record<Exclude<SectionId, "outro">, string[]> = {
  intro: ["intro", "teaser", "overview", "lookbook"],
  blusen: ["blus", "bluse", "hemdbluse", "blouse", "shirt"],
  weisse_hosen: ["weisse hose", "weiße hose", "white pant", "white trouser", "hose"],
  rocke: ["rock", "röck", "roecke", "skirt", "midi", "maxi"],
  tops: ["top", "seidentop", "silk top", "satin top"],
  westen: ["weste", "westen", "vest", "waistcoat", "gilet"]
};

// Best-effort section guess from a board name. Returns null when nothing matches
// confidently — callers should not collect from unmapped boards.
export function mapBoardNameToSection(boardName: string): SectionId | null {
  const lower = boardName.toLowerCase();

  for (const definition of COLLECTABLE_SECTIONS) {
    const hints = SECTION_NAME_HINTS[definition.id as Exclude<SectionId, "outro">];
    if (hints?.some((hint) => lower.includes(hint))) {
      return definition.id;
    }
  }

  return null;
}

export interface LoadedBoardConfig {
  path: string;
  // section -> deduped board ids
  bySection: BoardSectionConfig;
  // boardId -> section (reverse index used while collecting pins)
  sectionByBoardId: Map<string, SectionId>;
  totalBoardIds: number;
}

// Reads and validates a board config file. Throws a descriptive error (pointing
// at the example) when the file is missing or malformed so the CLI can guide the
// user instead of failing cryptically.
export function loadBoardConfig(configPath: string, examplePath: string): LoadedBoardConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Board config not found: ${configPath}\n` +
        `Copy ${examplePath} to ${configPath} and replace the placeholder board IDs ` +
        `with your real Pinterest board IDs (run pinterest:boards to list them).`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Board config is not valid JSON (${configPath}): ${reason}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Board config must be a JSON object of section -> [boardId,...] (${configPath}).`);
  }

  const validSections = new Set<SectionId>(COLLECTABLE_SECTIONS.map((definition) => definition.id));
  const bySection: BoardSectionConfig = {};
  const sectionByBoardId = new Map<string, SectionId>();
  let totalBoardIds = 0;

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!validSections.has(key as SectionId)) {
      continue; // ignore unknown keys (e.g. comments / outro)
    }
    const section = key as SectionId;
    if (!Array.isArray(value)) {
      throw new Error(`Board config section "${section}" must be an array of board IDs (${configPath}).`);
    }

    const ids: string[] = [];
    for (const entry of value) {
      const id = String(entry).trim();
      // Skip blank entries and untouched placeholders from the example file.
      if (!id || id.startsWith("BOARD_ID_")) {
        continue;
      }
      if (!sectionByBoardId.has(id)) {
        sectionByBoardId.set(id, section);
      }
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }

    if (ids.length > 0) {
      bySection[section] = ids;
      totalBoardIds += ids.length;
    }
  }

  if (totalBoardIds === 0) {
    throw new Error(
      `Board config has no usable board IDs (${configPath}). ` +
        `Replace the BOARD_ID_* placeholders with real IDs from pinterest:boards.`
    );
  }

  return { path: configPath, bySection, sectionByBoardId, totalBoardIds };
}
