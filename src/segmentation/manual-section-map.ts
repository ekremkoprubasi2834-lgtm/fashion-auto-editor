import type { ChapterName } from "./segmenter.js";

// Manual section map.
//
// Transcript-based item detection is unreliable for this script because the
// voiceover never says "Nummer 1 / Nummer 2 ...": the five summer pieces are
// introduced by content phrases only. Left to the generic marker detector the
// whole body collapses into a single item, which both breaks the on-screen
// structure and starves the renderer (only the first section's asset pool is
// ever used). This map pins the exact five-piece structure by anchoring each
// section to a distinctive opening phrase. When every anchor is found in order
// the map wins; otherwise the segmenter falls back to its generic detection.
export interface ManualSectionBlock {
  chapter: ChapterName;
  itemIndex: number | null;
  itemTitle: string | null;
  text: string;
}

interface SectionAnchor {
  itemIndex: number;
  itemTitle: string;
  anchor: RegExp;
}

// Item order matters: the anchors are matched left-to-right and must appear in
// this sequence for the map to apply. Titles are the exact approved on-screen
// strings (no raw English, no "Hemden"/"Hemd" main-category wording).
const SECTION_ANCHORS: SectionAnchor[] = [
  { itemIndex: 1, itemTitle: "Blusen & Hemdblusen", anchor: /Eine leichte Bluse ist eines der einfachsten Teile/i },
  { itemIndex: 2, itemTitle: "Weiße Hosen", anchor: /Viele Frauen sind bei weißen Hosen/i },
  { itemIndex: 3, itemTitle: "Midiröcke & Maxiröcke", anchor: /Ein Rock kann im Sommer sehr feminin/i },
  { itemIndex: 4, itemTitle: "Hochwertige Tops", anchor: /Ein schlichtes Top kann sehr einfach/i },
  { itemIndex: 5, itemTitle: "Westen", anchor: /Eine schlichte Weste oder ein leichter Sommerblazer/i }
];

// The outro is anchored separately so its content is split off the last item.
const OUTRO_ANCHOR = /Fass\w* wir kurz zusammen/i;

export function splitTranscriptByManualMap(transcript: string): ManualSectionBlock[] | null {
  const itemStarts = SECTION_ANCHORS.map((section) => {
    const match = transcript.match(section.anchor);
    return match?.index ?? -1;
  });

  if (itemStarts.some((index) => index < 0)) {
    return null;
  }

  if (!isStrictlyIncreasing(itemStarts)) {
    return null;
  }

  const outroMatch = transcript.match(OUTRO_ANCHOR);
  const outroStart = outroMatch?.index ?? -1;

  if (outroStart >= 0 && outroStart <= itemStarts[itemStarts.length - 1]) {
    return null;
  }

  const blocks: ManualSectionBlock[] = [];

  const introText = transcript.slice(0, itemStarts[0]).trim();
  if (introText.length > 0) {
    blocks.push({ chapter: "Intro", itemIndex: null, itemTitle: null, text: introText });
  }

  SECTION_ANCHORS.forEach((section, index) => {
    const start = itemStarts[index];
    const nextItemStart = itemStarts[index + 1] ?? Number.POSITIVE_INFINITY;
    const end = Math.min(nextItemStart, outroStart >= 0 ? outroStart : Number.POSITIVE_INFINITY);
    const text = transcript.slice(start, end === Number.POSITIVE_INFINITY ? transcript.length : end).trim();

    if (text.length > 0) {
      blocks.push({
        chapter: "Main Content",
        itemIndex: section.itemIndex,
        itemTitle: section.itemTitle,
        text
      });
    }
  });

  if (outroStart >= 0) {
    const outroText = transcript.slice(outroStart).trim();
    if (outroText.length > 0) {
      blocks.push({ chapter: "Outro", itemIndex: null, itemTitle: null, text: outroText });
    }
  }

  return blocks;
}

function isStrictlyIncreasing(values: number[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] <= values[index - 1]) {
      return false;
    }
  }
  return true;
}
