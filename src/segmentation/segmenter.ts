import { splitTranscriptByManualMap } from "./manual-section-map.js";

export interface SceneSegment {
  id: number;
  chapter: ChapterName;
  itemIndex: number | null;
  itemTitle: string | null;
  sceneIndex: number;
  startSeconds: number;
  endSeconds: number;
  section: string;
  spokenText: string;
}

export interface ItemSegment {
  itemIndex: number;
  itemTitle: string;
  scenes: SceneSegment[];
}

export interface ChapterSegment {
  chapter: ChapterName;
  scenes?: SceneSegment[];
  items?: ItemSegment[];
}

export interface SegmentationResult {
  scenes: SceneSegment[];
  chapters: ChapterSegment[];
  qualityWarnings: string[];
}

export type ChapterName = "Intro" | "Main Content" | "Outro";

const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 12;
const WORDS_PER_SECOND = 2.15;

interface TextBlock {
  chapter: ChapterName;
  itemIndex: number | null;
  itemTitle: string | null;
  text: string;
}

interface ItemBlock {
  itemIndex: number;
  itemTitle: string;
  sentences: string[];
}

interface ItemMarker {
  itemIndex: number;
  markerStart: number;
  contentStart: number;
}

interface MarkerMatch {
  itemIndex: number;
  remainingText: string;
}

const NUMBER_WORDS = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eins", 1],
  ["zwei", 2],
  ["drei", 3],
  ["vier", 4],
  ["funf", 5],
  ["fuenf", 5],
  ["fünf", 5],
  ["sechs", 6],
  ["sieben", 7],
  ["acht", 8],
  ["neun", 9],
  ["zehn", 10],
  ["bir", 1],
  ["iki", 2],
  ["uc", 3],
  ["üç", 3],
  ["dort", 4],
  ["dört", 4],
  ["bes", 5],
  ["beş", 5],
  ["alti", 6],
  ["altı", 6],
  ["yedi", 7],
  ["sekiz", 8],
  ["dokuz", 9],
  ["on", 10]
]);

export function segmentTranscript(transcript: string): SegmentationResult {
  const normalizedTranscript = normalizeTranscript(transcript);
  const sentences = splitIntoSentences(normalizedTranscript);

  if (sentences.length === 0) {
    throw new Error("Transcript does not contain enough text to build scene segments.");
  }

  const textBlocks = buildTextBlocks(normalizedTranscript, sentences);
  const scenes = buildSceneSegments(textBlocks);
  const chapters = buildChapters(scenes);
  const qualityWarnings = buildQualityWarnings(normalizedTranscript, scenes);

  return { scenes, chapters, qualityWarnings };
}

function buildSceneSegments(blocks: TextBlock[]): SceneSegment[] {
  const scenes: SceneSegment[] = [];
  let cursor = 0;

  for (const block of blocks) {
    const chunks = buildChunks(splitIntoSentences(block.text));

    for (const [index, spokenText] of chunks.entries()) {
      const duration = estimateDuration(spokenText);
      const startSeconds = cursor;
      const endSeconds = startSeconds + duration;
      cursor = endSeconds;

      scenes.push({
        id: scenes.length + 1,
        chapter: block.chapter,
        itemIndex: block.itemIndex,
        itemTitle: block.itemTitle,
        sceneIndex: index + 1,
        startSeconds,
        endSeconds,
        section: sectionForBlock(block),
        spokenText
      });
    }
  }

  return scenes;
}

function buildTextBlocks(transcript: string, sentences: string[]): TextBlock[] {
  const manualBlocks = splitTranscriptByManualMap(transcript);

  if (manualBlocks) {
    return manualBlocks.filter((block) => block.text.trim().length > 0);
  }

  const itemStarts = findItemMarkers(transcript);

  if (itemStarts.length === 0) {
    return buildFallbackTextBlocks(sentences);
  }

  const blocks: TextBlock[] = [];
  const firstItemStart = itemStarts[0].markerStart;
  const introText = transcript.slice(0, firstItemStart).trim();

  if (introText.length > 0) {
    blocks.push({
      chapter: "Intro",
      itemIndex: null,
      itemTitle: null,
      text: introText
    });
  }

  const itemBlocks = itemStarts.map((entry, index): ItemBlock => {
    const nextStart = itemStarts[index + 1]?.markerStart ?? transcript.length;
    const itemText = transcript.slice(entry.contentStart, nextStart).trim();
    const itemSentences = splitIntoSentences(itemText);

    return {
      itemIndex: entry.itemIndex,
      itemTitle: inferItemTitle(itemSentences[0] ?? itemText, entry.itemIndex),
      sentences: itemSentences.filter(Boolean)
    };
  });

  const { mainItems, outroSentences } = splitOutroFromLastItem(itemBlocks);

  for (const item of mainItems) {
    blocks.push({
      chapter: "Main Content",
      itemIndex: item.itemIndex,
      itemTitle: item.itemTitle,
      text: item.sentences.join(" ")
    });
  }

  if (outroSentences.length > 0) {
    blocks.push({
      chapter: "Outro",
      itemIndex: null,
      itemTitle: null,
      text: outroSentences.join(" ")
    });
  }

  return blocks.filter((block) => block.text.trim().length > 0);
}

function buildFallbackTextBlocks(sentences: string[]): TextBlock[] {
  if (sentences.length === 1) {
    return [{
      chapter: "Main Content",
      itemIndex: 1,
      itemTitle: inferItemTitle(sentences[0], 1),
      text: sentences[0]
    }];
  }

  const introCount = sentences.length >= 4 ? 1 : 0;
  const outroCount = sentences.length >= 4 ? 1 : 0;
  const mainSentences = sentences.slice(introCount, sentences.length - outroCount);
  const blocks: TextBlock[] = [];

  if (introCount > 0) {
    blocks.push({
      chapter: "Intro",
      itemIndex: null,
      itemTitle: null,
      text: sentences.slice(0, introCount).join(" ")
    });
  }

  blocks.push({
    chapter: "Main Content",
    itemIndex: 1,
    itemTitle: inferItemTitle(mainSentences[0] ?? "Main styling advice", 1),
    text: mainSentences.join(" ")
  });

  if (outroCount > 0) {
    blocks.push({
      chapter: "Outro",
      itemIndex: null,
      itemTitle: null,
      text: sentences.slice(sentences.length - outroCount).join(" ")
    });
  }

  return blocks;
}

function splitOutroFromLastItem(items: ItemBlock[]): { mainItems: ItemBlock[]; outroSentences: string[] } {
  if (items.length === 0) {
    return { mainItems: [], outroSentences: [] };
  }

  const mainItems = items.map((item) => ({ ...item, sentences: [...item.sentences] }));
  const lastItem = mainItems[mainItems.length - 1];
  const outroIndex = lastItem.sentences.findIndex((sentence, index) => index > 0 && isOutroSentence(sentence));

  if (outroIndex === -1) {
    return { mainItems, outroSentences: [] };
  }

  const outroSentences = lastItem.sentences.splice(outroIndex);
  return { mainItems, outroSentences };
}

function buildChapters(scenes: SceneSegment[]): ChapterSegment[] {
  const introScenes = scenes.filter((scene) => scene.chapter === "Intro");
  const mainScenes = scenes.filter((scene) => scene.chapter === "Main Content");
  const outroScenes = scenes.filter((scene) => scene.chapter === "Outro");
  const chapters: ChapterSegment[] = [];

  if (introScenes.length > 0) {
    chapters.push({ chapter: "Intro", scenes: introScenes });
  }

  chapters.push({
    chapter: "Main Content",
    items: buildItems(mainScenes)
  });

  if (outroScenes.length > 0) {
    chapters.push({ chapter: "Outro", scenes: outroScenes });
  }

  return chapters;
}

function buildItems(scenes: SceneSegment[]): ItemSegment[] {
  const items = new Map<number, ItemSegment>();

  for (const scene of scenes) {
    if (scene.itemIndex === null || scene.itemTitle === null) {
      continue;
    }

    const existing = items.get(scene.itemIndex);

    if (existing) {
      existing.scenes.push(scene);
      continue;
    }

    items.set(scene.itemIndex, {
      itemIndex: scene.itemIndex,
      itemTitle: scene.itemTitle,
      scenes: [scene]
    });
  }

  return [...items.values()].sort((left, right) => left.itemIndex - right.itemIndex);
}

function buildQualityWarnings(transcript: string, scenes: SceneSegment[]): string[] {
  const warnings: string[] = [];
  const expectedCounts = findExpectedItemCounts(transcript);
  const actualItemCount = new Set(
    scenes
      .filter((scene) => scene.chapter === "Main Content" && scene.itemIndex !== null)
      .map((scene) => scene.itemIndex)
  ).size;

  for (const expectedCount of expectedCounts) {
    if (expectedCount !== actualItemCount) {
      warnings.push(
        `Count mismatch: intro mentions ${expectedCount} pieces but detected ${actualItemCount} items.`
      );
    }
  }

  const itemIndexes = [...new Set(scenes.map((scene) => scene.itemIndex).filter((value): value is number => value !== null))];
  const sortedIndexes = [...itemIndexes].sort((left, right) => left - right);

  for (const [index, itemIndex] of sortedIndexes.entries()) {
    if (itemIndex !== index + 1) {
      warnings.push(`Item sequence warning: expected item ${index + 1}, found item ${itemIndex}.`);
      break;
    }
  }

  return [...new Set(warnings)];
}

function splitIntoSentences(text: string): string[] {
  return normalizeTranscript(text)
    .split(/(?<!\b\d)(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalizeTranscript(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\b((?:nummer|number|item|madde)\s+(?:\d+|[a-zA-ZäöüÄÖÜßçğıİöşüÇĞIÖŞÜ]+))\.\s+/gi, "$1: ")
    .trim();
}

function buildChunks(sentences: string[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];

  for (const sentence of sentences) {
    const candidate = [...current, sentence].join(" ");
    const candidateDuration = estimateDuration(candidate);

    if (current.length > 0 && candidateDuration > MAX_DURATION_SECONDS) {
      chunks.push(current.join(" "));
      current = [sentence];
      continue;
    }

    current.push(sentence);

    if (candidateDuration >= MIN_DURATION_SECONDS) {
      chunks.push(current.join(" "));
      current = [];
    }
  }

  if (current.length > 0) {
    const tail = current.join(" ");
    const lastIndex = chunks.length - 1;

    if (chunks[lastIndex] && estimateDuration(tail) < MIN_DURATION_SECONDS) {
      chunks[lastIndex] = `${chunks[lastIndex]} ${tail}`;
    } else {
      chunks.push(tail);
    }
  }

  return chunks.flatMap(splitLongChunk);
}

function splitLongChunk(chunk: string): string[] {
  if (estimateDuration(chunk) <= MAX_DURATION_SECONDS) {
    return [chunk];
  }

  const words = chunk.split(/\s+/).filter(Boolean);
  const maxWords = Math.max(1, Math.floor(MAX_DURATION_SECONDS * WORDS_PER_SECOND));
  const parts: string[] = [];

  for (let index = 0; index < words.length; index += maxWords) {
    parts.push(words.slice(index, index + maxWords).join(" "));
  }

  return parts;
}

function estimateDuration(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const estimated = Math.ceil(wordCount / WORDS_PER_SECOND);
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, estimated));
}

function sectionForBlock(block: TextBlock): string {
  if (block.chapter === "Intro") {
    return "intro";
  }

  if (block.chapter === "Outro") {
    return "outro";
  }

  return `item_${block.itemIndex}`;
}

function findItemMarkers(transcript: string): ItemMarker[] {
  const markers: ItemMarker[] = [];
  const markerPattern = /(^|[.!?]\s+)((?:(?:nummer|number|item|madde)\s+([a-zA-ZäöüÄÖÜßçğıİöşüÇĞIÖŞÜ]+|\d+)\s*:)|(?:(\d+)\.\s+))/gi;
  let match: RegExpExecArray | null;

  while ((match = markerPattern.exec(transcript)) !== null) {
    const prefix = match[1] ?? "";
    const rawNumber = match[3] ?? match[4];
    const itemIndex = rawNumber ? parseNumberToken(rawNumber) : undefined;

    if (itemIndex === undefined) {
      continue;
    }

    markers.push({
      itemIndex,
      markerStart: match.index + prefix.length,
      contentStart: match.index + match[0].length
    });
  }

  return markers;
}

function parseItemMarker(sentence: string): MarkerMatch | undefined {
  const trimmed = sentence.trim();
  const markerPattern = /^(?:(?:nummer|number|item|madde)\s+([a-zA-ZäöüÄÖÜßçğıİöşüÇĞIÖŞÜ]+|\d+)|(\d+)\s*[\).:-])(?:\s*[:.)-])?\s*/i;
  const match = trimmed.match(markerPattern);

  if (!match) {
    return undefined;
  }

  const rawNumber = match[1] ?? match[2];
  const itemIndex = parseNumberToken(rawNumber);

  if (itemIndex === undefined) {
    return undefined;
  }

  return {
    itemIndex,
    remainingText: trimmed.slice(match[0].length).trim()
  };
}

function stripItemMarker(sentence: string): string {
  return parseItemMarker(sentence)?.remainingText ?? sentence.trim();
}

function parseNumberToken(value: string): number | undefined {
  const normalized = value.toLocaleLowerCase("de-DE").trim();

  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }

  return NUMBER_WORDS.get(normalized);
}

function inferItemTitle(text: string, itemIndex: number): string {
  const firstClause = trimInlineTitle(text)
    .split(/[,.;:!?]/)[0]
    .replace(/\s+/g, " ")
    .trim();

  if (!firstClause) {
    return `Item ${itemIndex}`;
  }

  const words = firstClause.split(/\s+/).slice(0, 8).join(" ");
  return words.length > 0 ? words : `Item ${itemIndex}`;
}

function trimInlineTitle(text: string): string {
  const inlineBodyStart = text.search(
    /\s+(?:Ein|Eine|Einen|Einem|Der|Die|Das|Du|Sie|Es|Diese|Dieser|Dieses|Besonders|Schlicht|Und|Wenn)\b/
  );

  if (inlineBodyStart > 0) {
    return text.slice(0, inlineBodyStart);
  }

  return text;
}

function isOutroSentence(sentence: string): boolean {
  return /\b(finally|to recap|recap|in summary|remember|subscribe|comment below|thanks for watching|und da hast du sie|das waren|wenn dir dieses video gefallen hat|schreib mir in die kommentare|vergiss nicht zu liken|abonnieren|abonniere|zum schluss|zusammengefasst|kommentar|yorum|son olarak|ozetle|özetle|abone)\b/i.test(sentence);
}

function findExpectedItemCounts(text: string): number[] {
  const counts: number[] = [];
  const pattern = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eins|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|bir|iki|üç|uc|dört|dort|beş|bes|altı|alti|yedi|sekiz|dokuz|on)\s+(?:pieces|items|teile|sommerteile|sommerpieces|sommer-pieces|styling-fehler|farben|regeln|parca|parça|madde)\b/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const count = parseNumberToken(match[1]);

    if (count !== undefined) {
      counts.push(count);
    }
  }

  return [...new Set(counts)];
}
