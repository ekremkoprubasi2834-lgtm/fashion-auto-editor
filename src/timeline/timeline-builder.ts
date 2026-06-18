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
  sourceSceneId: number;
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

// On-screen pacing limits (real seconds, after scaling to the voiceover).
// Preference: aim for visual clips in the 4–6s range when possible. A single
// image must never hold longer than MAX_CLIP_SECONDS. Longer speech blocks are
// sliced into equal contiguous sub-clips so the visual changes more often.
// Slicing preserves the exact [start, end] span of the source scene, so total
// video duration and voiceover sync are untouched. Each sub-clip becomes its
// own scene downstream (fresh globalSceneIndex), which makes the section-locked
// resolver rotate assets across the sub-clips (A -> B -> A for a two-asset
// section, A -> B -> C for three) without ever leaving the section.
const PREFERRED_MAX_CLIP_SECONDS = 5; // target mid-point of 4–6s
const MAX_CLIP_SECONDS = 7; // hard cap

export function buildVisualTimeline(
  segments: SceneSegment[],
  options: {
    targetDurationSeconds?: number;
    sectionAssetCount?: (section: string) => number;
  } = {}
): VisualTimelineItem[] {
  let previousEntry: FashionKeywordEntry | undefined;
  const naturalDuration = segments[segments.length - 1]?.endSeconds ?? 0;
  const scale = options.targetDurationSeconds && naturalDuration > 0
    ? options.targetDurationSeconds / naturalDuration
    : 1;

  const items: VisualTimelineItem[] = [];

  for (const segment of segments) {
    const visual = createFashionVisualIntent(segment.spokenText, segment.section, segment.id, previousEntry);
    previousEntry = visual.entry ?? previousEntry;
    const chosenLayout = chooseVisualLayout({
      chapter: segment.chapter,
      itemTitle: segment.itemTitle,
      spokenText: segment.spokenText,
      visualIntent: visual.intent,
      searchKeywords: visual.keywords
    });
    const availableAssets = options.sectionAssetCount?.(segment.section) ?? Number.POSITIVE_INFINITY;
    const layoutType = downgradeLayoutForAssets(chosenLayout, availableAssets);

    const slices = sliceSceneDuration(segment.startSeconds * scale, segment.endSeconds * scale);

    for (const slice of slices) {
      items.push({
        startTime: secondsToClock(slice.start),
        endTime: secondsToClock(slice.end),
        globalSceneIndex: items.length + 1,
        sourceSceneId: segment.id,
        chapter: segment.chapter,
        itemIndex: segment.itemIndex,
        itemTitle: segment.itemTitle,
        sceneIndex: segment.sceneIndex,
        section: segment.section,
        spokenText: segment.spokenText,
        layoutType,
        motion: chooseMotionPlan(layoutType, items.length),
        visualIntent: visual.intent,
        suggestedAssetFolder: visual.folder,
        searchKeywords: visual.keywords
      });
    }
  }

  return items;
}

// Divide [start, end] into the fewest equal contiguous parts so that no part
// exceeds the preferred clip length. The last part absorbs any rounding so the
// slices always sum back to the exact original span.
function sliceSceneDuration(start: number, end: number): { start: number; end: number }[] {
  const duration = end - start;

  if (duration <= MAX_CLIP_SECONDS) {
    return [{ start, end }];
  }

  // Try to pick a slice count that yields per-slice durations in the 4–6s
  // range when possible. Compute bounds for counts that satisfy the target
  // range, then prefer a count that produces slices near the preferred value.
  const minCountForMax = Math.max(2, Math.ceil(duration / 6)); // ensures slice <= 6
  const maxCountForMin = Math.ceil(duration / 4); // ensures slice >= 4

  let count: number;

  if (minCountForMax <= maxCountForMin) {
    const desired = Math.max(2, Math.round(duration / PREFERRED_MAX_CLIP_SECONDS));
    count = Math.min(maxCountForMin, Math.max(minCountForMax, desired));
  } else {
    // No integer count yields a slice fully inside 4–6s; fall back to splitting
    // by the preferred max to keep slices reasonably sized (and under hard cap).
    count = Math.max(2, Math.ceil(duration / PREFERRED_MAX_CLIP_SECONDS));
  }

  // Ensure we never produce slices longer than the hard cap. If the chosen
  // count would still create a slice > MAX_CLIP_SECONDS, increase count.
  while (duration / count > MAX_CLIP_SECONDS) {
    count += 1;
  }

  const step = duration / count;
  const slices: { start: number; end: number }[] = [];

  for (let index = 0; index < count; index += 1) {
    slices.push({
      start: start + step * index,
      end: index === count - 1 ? end : start + step * (index + 1)
    });
  }

  return slices;
}

// A multi-panel layout must never request more distinct assets than the
// section actually owns, otherwise the resolver would be forced to repeat an
// image in adjacent panels. When a section is too small we step down to a
// simpler layout rather than borrow from another section.
const LAYOUT_DISTINCT_ASSETS: Record<VisualLayoutType, number> = {
  single_focus: 1,
  sequence_single: 1,
  detail_focus: 1,
  moodboard_2: 2,
  comparison_2: 2,
  moodboard_3: 3,
  recap_grid: 4
};

function downgradeLayoutForAssets(layoutType: VisualLayoutType, availableAssets: number): VisualLayoutType {
  if (availableAssets >= LAYOUT_DISTINCT_ASSETS[layoutType]) {
    return layoutType;
  }

  if (availableAssets >= 2) {
    return "moodboard_2";
  }

  return "sequence_single";
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
