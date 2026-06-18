import type { VisualTimelineItem } from "./timeline-builder.js";

// Required on-screen title cards.
//
// One card is inserted at the first scene of each section. The card does not
// extend the timeline: it carves its short duration out of the front of the
// section's first content clip, so total video length — and therefore voiceover
// sync — is untouched. Cards carry no asset (they never draw from a section
// pool) and render as premium drawtext frames downstream.
export interface TitleCardSpec {
  title: string;
  subtitle: string;
}

// Keyed by the timeline `section` value. Strings are the exact approved copy.
export const TITLE_CARD_SPECS: Record<string, TitleCardSpec> = {
  intro: { title: "5 Sommerteile", subtitle: "SOFORT ELEGANTER WIRKEN" },
  item_1: { title: "Nummer 1", subtitle: "Blusen & Hemdblusen" },
  item_2: { title: "Nummer 2", subtitle: "Weiße Hosen" },
  item_3: { title: "Nummer 3", subtitle: "Midiröcke & Maxiröcke" },
  item_4: { title: "Nummer 4", subtitle: "Hochwertige Tops" },
  item_5: { title: "Nummer 5", subtitle: "Westen" },
  outro: { title: "Diese 5 Sommerteile", subtitle: "wirken sofort eleganter" }
};

const TARGET_CARD_SECONDS = 2.0; // inside the required 1.5–2.5s window
const MIN_CARD_SECONDS = 1.5;
const MAX_CARD_SECONDS = 2.5;
const MIN_CONTENT_REMAINDER = 1.0; // keep the carved content clip visible

export function insertTitleCards(items: VisualTimelineItem[]): VisualTimelineItem[] {
  const seenSections = new Set<string>();
  const out: VisualTimelineItem[] = [];

  for (const item of items) {
    const spec = item.sceneType === "content" ? TITLE_CARD_SPECS[item.section] : undefined;

    if (spec && !seenSections.has(item.section)) {
      seenSections.add(item.section);

      const start = parseClock(item.startTime);
      const end = parseClock(item.endTime);
      const cardSeconds = resolveCardSeconds(end - start);

      out.push({
        ...item,
        startTime: secondsToClock(start),
        endTime: secondsToClock(start + cardSeconds),
        sceneIndex: 0,
        spokenText: "",
        layoutType: "single_focus",
        motion: { type: "slow_zoom_in", intensity: "subtle", beatCuts: [] },
        visualIntent: `Title card — ${spec.title} / ${spec.subtitle}`,
        suggestedAssetFolder: "",
        searchKeywords: [],
        sceneType: "title_card",
        titleCard: { title: spec.title, subtitle: spec.subtitle, section: item.section }
      });

      out.push({ ...item, startTime: secondsToClock(start + cardSeconds) });
      continue;
    }

    out.push(item);
  }

  return out.map((item, index) => ({ ...item, globalSceneIndex: index + 1 }));
}

function resolveCardSeconds(contentDuration: number): number {
  let card = Math.min(TARGET_CARD_SECONDS, contentDuration - MIN_CONTENT_REMAINDER);
  card = Math.max(MIN_CARD_SECONDS, Math.min(MAX_CARD_SECONDS, card));
  // For an unusually short opening clip, never consume the whole clip.
  return Math.min(card, Math.max(0.5, contentDuration - 0.5));
}

function parseClock(value: string): number {
  const parts = value.split(":").map((part) => Number.parseFloat(part));

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return Number.parseFloat(value) || 0;
}

function secondsToClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
}
