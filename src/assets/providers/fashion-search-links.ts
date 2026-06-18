import type { SectionId } from "../asset-source-provider.js";
import type { MoodboardSearchQuery } from "./fashion-moodboard-types.js";

export const FASHION_MOODBOARD_QUERIES: Record<Exclude<SectionId, "outro">, string[]> = {
  intro: [
    "elegant summer outfits women over 40 pinterest",
    "quiet luxury summer outfits women pinterest",
    "classy summer outfit mature woman pinterest",
    "neutral summer capsule wardrobe women over 40"
  ],
  blusen: [
    "weiße Bluse Damen Sommer Outfit Pinterest",
    "hellblaue Hemdbluse Damen Outfit Pinterest",
    "cream blouse white trousers outfit woman",
    "elegant blouse outfit women over 40"
  ],
  weisse_hosen: [
    "weiße Hose Damen Sommer Outfit Pinterest",
    "white wide leg trousers outfit women pinterest",
    "white pants cream blouse elegant outfit",
    "classy white trousers outfit women over 40"
  ],
  rocke: [
    "satin midi skirt outfit women pinterest",
    "fließender Midirock Sommer Outfit Damen",
    "maxi skirt summer outfit elegant women",
    "satin skirt blouse outfit women over 40"
  ],
  tops: [
    "satin top outfit women pinterest",
    "silk cami outfit women over 40",
    "satin top white pants outfit women",
    "hochwertiges Top Damen Sommer Outfit"
  ],
  westen: [
    "structured vest women outfit pinterest",
    "waistcoat outfit women summer pinterest",
    "linen vest women outfit summer",
    "sleeveless blazer women outfit pinterest",
    "Anzugweste Damen Sommer Outfit",
    "beige vest white pants outfit women"
  ]
};

const COLLECTABLE_MOODBOARD_SECTIONS = Object.keys(FASHION_MOODBOARD_QUERIES) as Exclude<SectionId, "outro">[];

export function collectableMoodboardSections(): SectionId[] {
  return [...COLLECTABLE_MOODBOARD_SECTIONS];
}

export function buildMoodboardSearchQueries(sections: SectionId[]): MoodboardSearchQuery[] {
  return sections.flatMap((section) => {
    if (section === "outro") {
      return [];
    }
    return FASHION_MOODBOARD_QUERIES[section].map((query) => ({ section, query }));
  });
}

export function pinterestSearchUrl(query: string): string {
  return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
}

export function renderMoodboardLinksMarkdown(): string {
  const lines = [
    "# Fashion Moodboard Search Links",
    "",
    "Browser-assisted Pinterest searches for collecting staging candidates. These links do not bypass the asset audit or render gate.",
    ""
  ];

  for (const section of COLLECTABLE_MOODBOARD_SECTIONS) {
    lines.push(`## ${section}`, "");
    for (const query of FASHION_MOODBOARD_QUERIES[section]) {
      lines.push(`- [${query}](${pinterestSearchUrl(query)})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
