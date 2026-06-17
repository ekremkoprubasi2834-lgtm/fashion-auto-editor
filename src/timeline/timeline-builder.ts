import { chooseVisualLayout, type VisualLayoutType } from "../layout/visual-layout-engine.js";
import type { SceneSegment } from "../segmentation/segmenter.js";

export type MotionType =
  | "slow_zoom_in"
  | "slow_zoom_out"
  | "pan_left"
  | "pan_right"
  | "pan_up"
  | "pan_down"
  | "push_in"
  | "ken_burns"
  | "comparison_reveal";

export interface MotionPlan {
  type: MotionType;
  intensity: "subtle" | "medium";
  beatCuts: number[];
}

export interface VisualTimelineItem {
  startTime: string;
  endTime: string;
  globalSceneIndex: number;
  chapter: string;
  itemIndex: number | null;
  itemTitle: string | null;
  sceneIndex: number;
  section: string;
  spokenText: string;
  layoutType: VisualLayoutType;
  motion: MotionPlan;
  visualIntent: string;
  suggestedAssetFolder: string;
  searchKeywords: string[];
}

export function buildVisualTimeline(
  segments: SceneSegment[],
  options: { targetDurationSeconds?: number } = {}
): VisualTimelineItem[] {
  let previousEntry: FashionKeywordEntry | undefined;
  const naturalDuration = segments[segments.length - 1]?.endSeconds ?? 0;
  const scale = options.targetDurationSeconds && naturalDuration > 0
    ? options.targetDurationSeconds / naturalDuration
    : 1;

  return segments.map((segment, index) => {
    const visual = createFashionVisualIntent(segment.spokenText, segment.section, segment.id, previousEntry);
    previousEntry = visual.entry ?? previousEntry;
    const layoutType = chooseVisualLayout({
      chapter: segment.chapter,
      itemTitle: segment.itemTitle,
      spokenText: segment.spokenText,
      visualIntent: visual.intent,
      searchKeywords: visual.keywords
    });

    return {
      startTime: secondsToClock(segment.startSeconds * scale),
      endTime: secondsToClock(segment.endSeconds * scale),
      globalSceneIndex: index + 1,
      chapter: segment.chapter,
      itemIndex: segment.itemIndex,
      itemTitle: segment.itemTitle,
      sceneIndex: segment.sceneIndex,
      section: segment.section,
      spokenText: segment.spokenText,
      layoutType,
      motion: chooseMotionPlan(layoutType, index),
      visualIntent: visual.intent,
      suggestedAssetFolder: visual.folder,
      searchKeywords: visual.keywords
    };
  });
}

function chooseMotionPlan(layoutType: VisualLayoutType, index: number): MotionPlan {
  if (layoutType === "comparison_2") {
    return { type: "comparison_reveal", intensity: "subtle", beatCuts: [0.42, 0.72] };
  }

  if (layoutType === "detail_focus") {
    return { type: "push_in", intensity: "subtle", beatCuts: [0.55] };
  }

  const rotation: MotionType[] = [
    "slow_zoom_in",
    "pan_right",
    "slow_zoom_out",
    "pan_left",
    "ken_burns",
    "pan_up",
    "push_in",
    "pan_down"
  ];

  return {
    type: rotation[index % rotation.length],
    intensity: "subtle",
    beatCuts: layoutType === "moodboard_2" || layoutType === "moodboard_3" ? [0.5] : []
  };
}

interface FashionKeywordEntry {
  id: string;
  priority: number;
  patterns: RegExp[];
  visualIntent: string;
  folder: string;
  keywords: string[];
}

interface FashionVisual {
  intent: string;
  folder: string;
  keywords: string[];
  entry?: FashionKeywordEntry;
}

const FASHION_KEYWORD_DICTIONARY: FashionKeywordEntry[] = [
  {
    id: "linen_trousers",
    priority: 100,
    patterns: [/\blinen trousers?\b/, /\blinen pants?\b/],
    visualIntent: "white linen trousers as elegant alternative to shorts",
    folder: "assets/02_linen_trousers",
    keywords: [
      "white linen trousers summer outfit women",
      "linen pants elegant outfit",
      "old money linen trousers outfit",
      "summer outfit without shorts women"
    ]
  },
  {
    id: "silk_trousers",
    priority: 98,
    patterns: [/\bsilk trousers?\b/, /\bsilk pants?\b/],
    visualIntent: "flowy silk trousers for polished summer evening outfit",
    folder: "assets/05_silk_trousers",
    keywords: [
      "silk trousers outfit women",
      "flowy silk pants elegant outfit",
      "summer evening silk trousers outfit",
      "minimal silk pants outfit women"
    ]
  },
  {
    id: "summer_dress",
    priority: 96,
    patterns: [/\bsummer dress(?:es)?\b/, /\blinen dress(?:es)?\b/, /\brelaxed dress(?:es)?\b/],
    visualIntent: "relaxed linen summer dress elegant effortless outfit",
    folder: "assets/04_summer_dress",
    keywords: [
      "relaxed summer dress outfit women",
      "linen summer dress elegant",
      "minimalist summer dress outfit",
      "effortless summer dress women"
    ]
  },
  {
    id: "midi_skirt",
    priority: 94,
    patterns: [/\bmidi skirts?\b/],
    visualIntent: "cream midi skirt elegant summer alternative",
    folder: "assets/03_midi_skirt",
    keywords: [
      "cream midi skirt summer outfit",
      "white midi skirt elegant outfit women",
      "feminine summer skirt outfit",
      "old money midi skirt outfit"
    ]
  },
  {
    id: "maxi_skirt",
    priority: 92,
    patterns: [/\bmaxi skirts?\b/],
    visualIntent: "flowy neutral maxi skirt elegant summer styling",
    folder: "assets/03_maxi_skirt",
    keywords: [
      "neutral maxi skirt summer outfit",
      "white maxi skirt elegant outfit women",
      "flowy maxi skirt outfit summer",
      "minimal maxi skirt outfit women"
    ]
  },
  {
    id: "shorts",
    priority: 90,
    patterns: [/\bshorts?\b/],
    visualIntent: "casual summer shorts vs elegant summer outfit comparison",
    folder: "assets/01_shorts_problem",
    keywords: [
      "summer shorts outfit women casual",
      "shorts outfit not elegant",
      "casual summer outfit women",
      "elegant summer outfit alternative"
    ]
  },
  {
    id: "white_pants",
    priority: 88,
    patterns: [/\bwhite pants?\b/, /\bwhite trousers?\b/],
    visualIntent: "white pants clean polished summer outfit",
    folder: "assets/06_white_pants",
    keywords: [
      "white pants summer outfit women",
      "white trousers elegant outfit",
      "clean white pants outfit women",
      "minimal summer outfit white pants"
    ]
  },
  {
    id: "raffia_bag",
    priority: 84,
    patterns: [/\braffia bags?\b/, /\bstraw bags?\b/, /\bwoven bags?\b/],
    visualIntent: "raffia bag accessory detail for refined summer outfit",
    folder: "assets/07_raffia_bag",
    keywords: [
      "raffia bag summer outfit",
      "woven bag outfit women",
      "straw bag elegant summer outfit",
      "old money summer accessories"
    ]
  },
  {
    id: "sneakers",
    priority: 82,
    patterns: [/\bsneakers?\b/, /\btrainers?\b/],
    visualIntent: "minimal sneakers styled with polished casual summer outfit",
    folder: "assets/08_sneakers",
    keywords: [
      "white sneakers summer outfit women",
      "minimal sneakers outfit women",
      "casual chic sneakers outfit",
      "elegant outfit with sneakers women"
    ]
  },
  {
    id: "jeans",
    priority: 80,
    patterns: [/\bjeans?\b/, /\bdenim\b/],
    visualIntent: "clean straight-leg jeans styled for elevated casual look",
    folder: "assets/09_jeans",
    keywords: [
      "straight leg jeans outfit women",
      "elevated casual jeans outfit",
      "minimal denim outfit women",
      "summer jeans outfit elegant"
    ]
  },
  {
    id: "accessories",
    priority: 70,
    patterns: [/\baccessor(?:y|ies)\b/, /\bbags?\b/, /\bbelts?\b/, /\bearrings?\b/, /\bscarves?\b/, /\bjewelry\b/],
    visualIntent: "minimal accessories close-up to finish a polished outfit",
    folder: "assets/10_accessories",
    keywords: [
      "minimal accessories outfit women",
      "summer accessories elegant outfit",
      "belt earrings scarf styling",
      "polished outfit accessories women"
    ]
  },
  {
    id: "breathable_fabrics",
    priority: 60,
    patterns: [/\bbreathable fabrics?\b/, /\blinen\b/, /\bcotton\b/, /\bsilk\b/],
    visualIntent: "breathable summer fabrics with linen cotton and silk texture details",
    folder: "assets/11_breathable_fabrics",
    keywords: [
      "breathable summer fabrics outfit",
      "linen cotton summer outfit women",
      "natural fabrics summer wardrobe",
      "lightweight fabric outfit women"
    ]
  },
  {
    id: "clean_cuts",
    priority: 50,
    patterns: [/\bclean cuts?\b/, /\bclean lines?\b/, /\btailored\b/, /\bstructured\b/],
    visualIntent: "clean cut silhouettes and tailored lines for polished summer styling",
    folder: "assets/12_clean_cuts",
    keywords: [
      "clean cuts outfit women",
      "tailored summer outfit women",
      "structured minimal outfit",
      "polished clean lines fashion"
    ]
  },
  {
    id: "neutral_colors",
    priority: 45,
    patterns: [/\bneutral colors?\b/, /\bneutral tones?\b/, /\bsoft neutral\b/],
    visualIntent: "soft neutral color palette for polished summer wardrobe",
    folder: "assets/13_neutral_colors",
    keywords: [
      "neutral colors summer outfit",
      "soft neutral outfit women",
      "minimal neutral wardrobe women",
      "cream beige white outfit women"
    ]
  },
  {
    id: "colors",
    priority: 40,
    patterns: [/\bwhite\b/, /\bcream\b/, /\bbeige\b/, /\bblack\b/, /\bgray\b/, /\bgrey\b/, /\bburgundy\b/, /\bnavy\b/, /\bcolor palette\b/],
    visualIntent: "fashion color palette board with white cream beige and refined neutrals",
    folder: "assets/14_colors",
    keywords: [
      "cream white summer outfit women",
      "neutral fashion color palette",
      "beige white outfit women",
      "refined summer color palette"
    ]
  }
];

const PROBLEM_LANGUAGE = [
  { pattern: /\binstead of\b/, phrase: "alternative styling direction" },
  { pattern: /\balternative\b/, phrase: "elegant alternative framing" },
  { pattern: /\bnot polished\b|\bnot polished enough\b/, phrase: "not polished problem contrast" },
  { pattern: /\btoo casual\b/, phrase: "too casual outfit problem" },
  { pattern: /\brevealing\b|\btoo revealing\b/, phrase: "too revealing fit concern" },
  { pattern: /\blook cheap\b|\blooks cheap\b/, phrase: "avoid cheap-looking styling" },
  { pattern: /\blook elegant\b|\blooks elegant\b|\belegant\b/, phrase: "elegant outfit goal" },
  { pattern: /\brefined\b|\bexpensive\b|\bpolished\b/, phrase: "refined polished upgrade" }
];

function createFashionVisualIntent(
  text: string,
  section: string,
  sceneId: number,
  previousEntry?: FashionKeywordEntry
): FashionVisual {
  const normalized = normalizeText(text);
  const entry = findBestFashionEntry(normalized);
  const modifiers = collectIntentModifiers(normalized);

  if (!entry) {
    if (previousEntry && isContinuationScene(normalized, modifiers)) {
      return createContinuationVisual(previousEntry, normalized, modifiers);
    }

    return createFallbackVisual(section, sceneId, modifiers);
  }

  return {
    intent: withModifiers(entry.visualIntent, modifiers),
    folder: entry.folder,
    keywords: enrichKeywords(entry.keywords, normalized),
    entry
  };
}

function findBestFashionEntry(normalizedText: string): FashionKeywordEntry | undefined {
  return FASHION_KEYWORD_DICTIONARY
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(normalizedText)))
    .sort((left, right) => right.priority - left.priority)[0];
}

function collectIntentModifiers(normalizedText: string): string[] {
  return PROBLEM_LANGUAGE
    .filter((item) => item.pattern.test(normalizedText))
    .map((item) => item.phrase);
}

function isContinuationScene(normalizedText: string, modifiers: string[]): boolean {
  return modifiers.length > 0 || /\bthey\b|\bthem\b|\bit\b|\bthe same\b|\bsilhouette\b|\blook you want\b/.test(normalizedText);
}

function createContinuationVisual(
  entry: FashionKeywordEntry,
  normalizedText: string,
  modifiers: string[]
): FashionVisual {
  return {
    intent: withModifiers(`${entry.visualIntent} continuation with detail and comparison b-roll`, modifiers),
    folder: entry.folder,
    keywords: enrichKeywords(entry.keywords, normalizedText),
    entry
  };
}

function withModifiers(intent: string, modifiers: string[]): string {
  if (modifiers.length === 0) {
    return intent;
  }

  return `${intent}; ${dedupe(modifiers).join(", ")}`;
}

function enrichKeywords(baseKeywords: string[], normalizedText: string): string[] {
  const extras: string[] = [];

  if (/\bwhite\b/.test(normalizedText)) {
    extras.push("white summer outfit women");
  }

  if (/\bcream\b/.test(normalizedText)) {
    extras.push("cream summer outfit women");
  }

  if (/\bneutral colors?\b|\bneutral tones?\b|\bsoft neutral\b/.test(normalizedText)) {
    extras.push("soft neutral summer outfit");
  }

  if (/\bbreathable\b|\blinen\b|\bcotton\b|\bsilk\b/.test(normalizedText)) {
    extras.push("breathable summer outfit women");
  }

  if (/\bpolished\b|\brefined\b|\bexpensive\b|\belegant\b/.test(normalizedText)) {
    extras.push("polished elegant summer outfit women");
  }

  if (/\binstead of\b|\balternative\b|\bwithout\b/.test(normalizedText)) {
    extras.push("summer outfit alternative women");
  }

  return dedupe([...baseKeywords, ...extras]).slice(0, 6);
}

function createFallbackVisual(section: string, sceneId: number, modifiers: string[]): FashionVisual {
  const intent = section === "hook" || section === "intro"
    ? "opening fashion problem setup with summer outfit comparison and refined styling promise"
    : "specific editorial women fashion b-roll matching the styling advice with clean outfit details";

  return {
    intent: withModifiers(intent, modifiers),
    folder: `assets/${String(sceneId).padStart(2, "0")}_fashion_general`,
    keywords: enrichKeywords(
      [
        "women summer outfit styling",
        "elegant casual outfit women",
        "minimal chic summer outfit",
        "polished fashion b roll"
      ],
      ""
    )
  };
}

function normalizeText(text: string): string {
  return text
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function secondsToClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
}
