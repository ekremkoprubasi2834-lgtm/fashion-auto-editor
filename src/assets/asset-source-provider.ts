// Visual Asset Finder — provider interface layer.
//
// This file defines the stable contracts the rest of the asset-collection
// pipeline depends on, plus the single source of truth for the seven canonical
// sections (their minimums, import folders, prefixes and seed search queries).
//
// The concrete providers live in sibling files:
//   - local-folder-provider.ts  (active)  — reads downloaded files from disk
//   - search-link-provider.ts   (active)  — emits Pinterest/Google/stock URLs
//   - (future) pinterest-provider, stock-provider — remote collection
//
// Nothing here performs I/O so it can be imported from any context cheaply.

export type SectionId =
  | "intro"
  | "blusen"
  | "weisse_hosen"
  | "rocke"
  | "tops"
  | "westen"
  | "outro";

export type MediaType = "image" | "video" | "unknown";

export interface SearchQuery {
  section: SectionId;
  query: string;
  locale: "de" | "en";
}

export interface CandidateAsset {
  section: SectionId;
  providerId: string;
  absolutePath: string | null;
  sourceUrl: string | null;
  filename: string;
  mediaType: MediaType;
  extension: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  contentHash: string | null;
  perceptualHash: string | null;
  flags: string[];
}

export interface SectionAssetPool {
  section: SectionId;
  minimum: number;
  candidates: CandidateAsset[];
}

export interface SearchLink {
  section: SectionId;
  query: string;
  links: { label: string; url: string }[];
}

// Base contract every provider satisfies.
export interface AssetSourceProvider {
  readonly id: string;
  readonly kind: "local" | "search-link" | "remote";
  isAvailable(): boolean;
}

// Providers that yield concrete candidate files (local disk, future remote APIs).
export interface CollectingProvider extends AssetSourceProvider {
  collect(sections: SectionId[]): Promise<CandidateAsset[]>;
}

// Providers that only emit where-to-look links (no download).
export interface LinkProvider extends AssetSourceProvider {
  buildLinks(queries: SearchQuery[]): SearchLink[];
}

export interface SectionDefinition {
  id: SectionId;
  // Big on-screen-friendly German title used in reports/links.
  displayTitle: string;
  // 2-digit prefix used when assets are prepared into assets/ so the existing
  // section-locked resolver binds them to the right item. Empty for derived
  // sections (outro recaps the five items, it is never collected directly).
  assetPrefix: string;
  // Filename stem used when copying prepared assets, e.g. "01-blusen".
  namePrefix: string;
  // Subfolder under Desktop/new-fashion-assets/ for local import. null = derived.
  importFolder: string | null;
  // Minimum distinct assets required before this section is "ready".
  minimum: number;
  // Derived sections are not collected; they are satisfied by the other items.
  derived: boolean;
  seedQueries: string[];
}

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    id: "intro",
    displayTitle: "INTRO",
    assetPrefix: "00-",
    namePrefix: "00-intro",
    importFolder: "intro",
    minimum: 15,
    derived: false,
    seedQueries: [
      "elegant summer outfits women over 40",
      "quiet luxury summer outfit women",
      "gepflegter Sommerlook Damen 50",
      "neutral elegant summer style mature woman"
    ]
  },
  {
    id: "blusen",
    displayTitle: "NUMMER 1 — BLUSEN & HEMDBLUSEN",
    assetPrefix: "01-",
    namePrefix: "01-blusen",
    importFolder: "blusen",
    minimum: 25,
    derived: false,
    seedQueries: [
      "weiße Bluse Damen Sommer elegant",
      "hellblaue Hemdbluse Damen Outfit",
      "cream blouse elegant women summer",
      "leichte Bluse Damen 50 Sommer"
    ]
  },
  {
    id: "weisse_hosen",
    displayTitle: "NUMMER 2 — WEISSE HOSEN",
    assetPrefix: "02-",
    namePrefix: "02-weisse-hose",
    importFolder: "weisse-hosen",
    minimum: 25,
    derived: false,
    seedQueries: [
      "weiße Hose Damen Sommer elegant",
      "white wide leg trousers women outfit",
      "cream blouse white pants outfit women",
      "weiße Stoffhose Damen elegant"
    ]
  },
  {
    id: "rocke",
    displayTitle: "NUMMER 3 — MIDIRÖCKE & MAXIRÖCKE",
    assetPrefix: "03-",
    namePrefix: "03-rock",
    importFolder: "rocke",
    minimum: 25,
    derived: false,
    seedQueries: [
      "fließender Midirock Sommer Damen",
      "satin midi skirt elegant women",
      "Maxirock Sommer Outfit Damen",
      "midi skirt summer outfit women over 40"
    ]
  },
  {
    id: "tops",
    displayTitle: "NUMMER 4 — HOCHWERTIGE TOPS",
    assetPrefix: "04-",
    namePrefix: "04-top",
    importFolder: "tops",
    minimum: 25,
    derived: false,
    seedQueries: [
      "satin top elegant women outfit",
      "silk top summer outfit mature woman",
      "Seidentop Damen Sommer elegant",
      "hochwertiges Top Damen Sommer"
    ]
  },
  {
    id: "westen",
    displayTitle: "NUMMER 5 — WESTEN",
    assetPrefix: "05-",
    namePrefix: "05-weste",
    importFolder: "westen",
    minimum: 25,
    derived: false,
    seedQueries: [
      "strukturierte Weste Damen Sommer",
      "Weste Damen elegant Outfit",
      "linen vest women summer outfit",
      "sleeveless blazer women outfit",
      "waistcoat outfit women summer",
      "beige vest white pants outfit women"
    ]
  },
  {
    id: "outro",
    displayTitle: "OUTRO / RECAP",
    assetPrefix: "",
    namePrefix: "",
    importFolder: null,
    minimum: 0,
    derived: true,
    seedQueries: []
  }
];

export const SECTION_BY_ID: Record<SectionId, SectionDefinition> = Object.fromEntries(
  SECTION_DEFINITIONS.map((definition) => [definition.id, definition])
) as Record<SectionId, SectionDefinition>;

// Sections that are actually collected from sources (everything except derived
// recaps like the outro).
export const COLLECTABLE_SECTIONS: SectionDefinition[] = SECTION_DEFINITIONS.filter(
  (definition) => !definition.derived
);

export function getSectionDefinition(section: SectionId): SectionDefinition {
  return SECTION_BY_ID[section];
}

// Cheap heuristic: queries with German fashion words / umlauts are searched in
// German, everything else in English. Used only to label links, never to gate.
export function inferLocale(query: string): "de" | "en" {
  if (/[äöüß]/i.test(query)) {
    return "de";
  }

  const germanHints = ["damen", "sommer", "hose", "bluse", "rock", "weste", "seiden", "stoff", "look"];
  const lower = query.toLowerCase();
  return germanHints.some((hint) => lower.includes(hint)) ? "de" : "en";
}
