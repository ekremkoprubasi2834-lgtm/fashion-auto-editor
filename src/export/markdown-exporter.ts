import type { SceneSegment } from "../segmentation/segmenter.js";
import type { VisualTimelineItem } from "../timeline/timeline-builder.js";
import { formatDurationRange } from "../utils/time.js";

export function exportEditingGuide(
  segments: SceneSegment[],
  timeline: VisualTimelineItem[],
  qualityWarnings: string[] = []
): string {
  const lines: string[] = [
    "# Fashion Video Editing Guide",
    "",
    "## Overview",
    "",
    "- Format: women's fashion YouTube video",
    "- Pace: clean editorial cuts with 5-12 second scenes",
    "- Visual direction: polished capsule wardrobe, styling details, outfit transitions",
    "",
    "## Quality Warnings",
    ""
  ];

  if (qualityWarnings.length === 0) {
    lines.push("- None", "");
  } else {
    lines.push(...qualityWarnings.map((warning) => `- ${warning}`), "");
  }

  lines.push("## Scene Plan", "");

  appendChapterScenes(lines, "Intro", segments, timeline);
  appendMainContent(lines, segments, timeline);
  appendChapterScenes(lines, "Outro", segments, timeline);

  lines.push(
    "## Editing Notes",
    "",
    "- Use soft jump cuts between complete ideas.",
    "- Prefer close-up fabric, accessory, shoe, and mirror shots over generic stock footage.",
    "- Keep subtitles readable with two-line maximum captions.",
    "- Match visual changes to nouns in the spoken text: blazer, skirt, color palette, bag, shoes, belt, jewelry."
  );

  return lines.join("\n") + "\n";
}

function appendChapterScenes(
  lines: string[],
  chapter: SceneSegment["chapter"],
  segments: SceneSegment[],
  timeline: VisualTimelineItem[]
): void {
  const chapterSegments = segments.filter((segment) => segment.chapter === chapter);

  if (chapterSegments.length === 0) {
    return;
  }

  lines.push(`# Chapter: ${chapter}`, "");

  for (const segment of chapterSegments) {
    appendScene(lines, segment, timeline[segment.id - 1]);
  }
}

function appendMainContent(lines: string[], segments: SceneSegment[], timeline: VisualTimelineItem[]): void {
  const mainSegments = segments.filter((segment) => segment.chapter === "Main Content");

  if (mainSegments.length === 0) {
    return;
  }

  lines.push("# Chapter: Main Content", "");

  const itemIndexes = [...new Set(
    mainSegments
      .map((segment) => segment.itemIndex)
      .filter((itemIndex): itemIndex is number => itemIndex !== null)
  )].sort((left, right) => left - right);

  for (const itemIndex of itemIndexes) {
    const itemSegments = mainSegments.filter((segment) => segment.itemIndex === itemIndex);
    const itemTitle = itemSegments[0]?.itemTitle ?? `Item ${itemIndex}`;
    lines.push(`## Item ${itemIndex}: ${itemTitle}`, "");

    for (const segment of itemSegments) {
      appendScene(lines, segment, timeline[segment.id - 1]);
    }
  }
}

function appendScene(lines: string[], segment: SceneSegment, item: VisualTimelineItem): void {
  lines.push(
    `### Scene ${segment.sceneIndex}`,
    "",
    `- Time: ${formatDurationRange(segment.startSeconds, segment.endSeconds)}`,
    `- Spoken text: ${segment.spokenText}`,
    `- Visual intent: ${item.visualIntent}`,
    `- Suggested asset folder: ${item.suggestedAssetFolder}`,
    `- Search keywords: ${item.searchKeywords.join(", ")}`,
    ""
  );
}
