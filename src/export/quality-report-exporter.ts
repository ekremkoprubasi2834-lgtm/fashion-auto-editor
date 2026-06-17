import { runGermanFashionQa, type QualityWarning } from "../quality/german-fashion-qa.js";
import { runSubscriberConversionQa, type SubscriberQaWarning } from "../quality/subscriber-conversion-qa.js";
import type { SegmentationResult } from "../segmentation/segmenter.js";
import type { VisualTimelineItem } from "../timeline/timeline-builder.js";
import type { TranscriptResult } from "../transcription/transcriber.js";

export function exportQualityReport(
  transcript: TranscriptResult,
  segmentation: SegmentationResult,
  timeline: VisualTimelineItem[]
): string {
  const chapterCount = segmentation.chapters.length;
  const itemCount = countItems(segmentation);
  const sceneCount = segmentation.scenes.length;
  const germanWarnings = runGermanFashionQa(transcript.text);
  const subscriberWarnings = runSubscriberConversionQa(transcript.text);
  const lines: string[] = [
    "# Quality Report",
    "",
    "## Summary",
    "",
    `- Transcript source: ${transcript.source} via ${transcript.provider}`,
    `- Total chapters: ${chapterCount}`,
    `- Total items: ${itemCount}`,
    `- Total scenes: ${sceneCount}`,
    "",
    "## Detected Structure",
    ""
  ];

  for (const chapter of segmentation.chapters) {
    lines.push(`- Chapter: ${chapter.chapter}`);

    if (chapter.scenes) {
      lines.push(`  - Scenes: ${chapter.scenes.length}`);
    }

    if (chapter.items) {
      lines.push(`  - Items: ${chapter.items.length}`);

      for (const item of chapter.items) {
        lines.push(`  - Item ${item.itemIndex}: ${item.itemTitle} (${item.scenes.length} scene${item.scenes.length === 1 ? "" : "s"})`);
      }
    }
  }

  lines.push(
    "",
    "## Layout Summary",
    "",
    `- single_blur: ${countLayout(timeline, "single_blur")} scenes`,
    `- moodboard_3: ${countLayout(timeline, "moodboard_3")} scenes`,
    `- comparison_2: ${countLayout(timeline, "comparison_2")} scenes`,
    `- recap_grid: ${countLayout(timeline, "recap_grid")} scenes`
  );

  lines.push(
    "",
    "## Count Consistency Warnings",
    ""
  );

  if (segmentation.qualityWarnings.length === 0) {
    lines.push("- None");
  } else {
    lines.push(...segmentation.qualityWarnings.map((warning) => `- ${warning}`));
  }

  lines.push(
    "",
    "## German Fashion QA Warnings",
    ""
  );

  if (germanWarnings.length === 0) {
    lines.push("- None");
  } else {
    lines.push(...germanWarnings.map((warning) => `- ${formatGermanFashionWarning(warning)}`));
  }

  lines.push(
    "",
    "## Subscriber Conversion Warnings",
    ""
  );

  if (subscriberWarnings.length === 0) {
    lines.push("- No subscriber conversion warnings detected.");
  } else {
    lines.push(...subscriberWarnings.map((warning) => `- ${formatSubscriberWarning(warning)}`));
  }

  lines.push(
    "",
    "## Trust Notes",
    "",
    "- Kişi hedef alınmamalı, styling tercihi yorumlanmalı.",
    "- Yorum almak için dil hatası bırakılmamalı.",
    "- Abone çağrısı sadece sona bırakılmamalı.",
    "- Başlık, intro, body ve outro madde sayısı tutarlı olmalı."
  );

  return lines.join("\n") + "\n";
}

function countItems(segmentation: SegmentationResult): number {
  return segmentation.chapters.reduce((total, chapter) => total + (chapter.items?.length ?? 0), 0);
}

function countLayout(timeline: VisualTimelineItem[], layoutType: VisualTimelineItem["layoutType"]): number {
  return timeline.filter((item) => item.layoutType === layoutType).length;
}

function formatGermanFashionWarning(warning: QualityWarning): string {
  if (warning.suggestion) {
    return `${warning.term}: Warning: ${warning.message} Use "${warning.suggestion}".`;
  }

  return `${warning.term}: Warning: ${warning.message}`;
}

function formatSubscriberWarning(warning: SubscriberQaWarning): string {
  if (warning.suggestion) {
    return `${warning.message} ${warning.suggestion}`;
  }

  return warning.message;
}
