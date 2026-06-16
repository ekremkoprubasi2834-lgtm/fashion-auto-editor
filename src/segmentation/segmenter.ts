export interface SceneSegment {
  id: number;
  startSeconds: number;
  endSeconds: number;
  section: string;
  spokenText: string;
}

const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 12;
const WORDS_PER_SECOND = 2.15;

export function segmentTranscript(transcript: string): SceneSegment[] {
  const sentences = splitIntoSentences(transcript);

  if (sentences.length === 0) {
    throw new Error("Transcript does not contain enough text to build scene segments.");
  }

  const chunks = buildChunks(sentences);
  let cursor = 0;

  return chunks.map((spokenText, index) => {
    const duration = estimateDuration(spokenText);
    const startSeconds = cursor;
    const endSeconds = startSeconds + duration;
    cursor = endSeconds;

    return {
      id: index + 1,
      startSeconds,
      endSeconds,
      section: sectionForIndex(index, chunks.length),
      spokenText
    };
  });
}

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
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

function sectionForIndex(index: number, total: number): string {
  if (index === 0) {
    return "hook";
  }

  if (index === total - 1) {
    return "closing";
  }

  return `style_tip_${index}`;
}
