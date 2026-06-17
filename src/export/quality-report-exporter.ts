import { runGermanFashionQa, type QualityWarning } from "../quality/german-fashion-qa.js";
import type { SegmentationResult } from "../segmentation/segmenter.js";
import type { TranscriptResult } from "../transcription/transcriber.js";

export function exportQualityReport(transcript: TranscriptResult, segmentation: SegmentationResult): string {
  const chapterCount = segmentation.chapters.length;
  const itemCount = countItems(segmentation);
  const sceneCount = segmentation.scenes.length;
  const germanWarnings = runGermanFashionQa(transcript.text);
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

function formatGermanFashionWarning(warning: QualityWarning): string {
  if (warning.suggestion) {
    return `${warning.term}: Warning: ${warning.message} Use "${warning.suggestion}".`;
  }

  return `${warning.term}: Warning: ${warning.message}`;
}
