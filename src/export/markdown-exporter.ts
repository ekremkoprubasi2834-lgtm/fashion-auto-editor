import type { SceneSegment } from "../segmentation/segmenter.js";
import type { VisualTimelineItem } from "../timeline/timeline-builder.js";
import { formatDurationRange } from "../utils/time.js";

export function exportEditingGuide(segments: SceneSegment[], timeline: VisualTimelineItem[]): string {
  const lines: string[] = [
    "# Fashion Video Editing Guide",
    "",
    "## Overview",
    "",
    "- Format: women's fashion YouTube video",
    "- Pace: clean editorial cuts with 5-12 second scenes",
    "- Visual direction: polished capsule wardrobe, styling details, outfit transitions",
    "",
    "## Scene Plan",
    ""
  ];

  for (const [index, segment] of segments.entries()) {
    const item = timeline[index];
    lines.push(
      `### Scene ${segment.id}: ${segment.section}`,
      "",
      `- Time: ${formatDurationRange(segment.startSeconds, segment.endSeconds)}`,
      `- Spoken text: ${segment.spokenText}`,
      `- Visual intent: ${item.visualIntent}`,
      `- Suggested asset folder: ${item.suggestedAssetFolder}`,
      `- Search keywords: ${item.searchKeywords.join(", ")}`,
      ""
    );
  }

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
