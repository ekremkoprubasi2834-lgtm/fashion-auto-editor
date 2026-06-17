import type { AssetManifestEntry } from "../assets/asset-manifest-builder.js";
import type { SceneAssetRequirement } from "../assets/asset-requirements-builder.js";
import { runGermanFashionQa, type QualityWarning } from "../quality/german-fashion-qa.js";
import { runSubscriberConversionQa, type SubscriberQaWarning } from "../quality/subscriber-conversion-qa.js";
import type { FfmpegPreflightResult } from "../render/ffmpeg-preflight.js";
import type { VideoRenderPlan } from "../render/render-plan-builder.js";
import type { ScenePreviewRenderResult } from "../render/scene-preview-renderer.js";
import type { SegmentationResult } from "../segmentation/segmenter.js";
import type { VisualTimelineItem } from "../timeline/timeline-builder.js";
import type { TranscriptResult } from "../transcription/transcriber.js";

export function exportQualityReport(
  transcript: TranscriptResult,
  segmentation: SegmentationResult,
  timeline: VisualTimelineItem[],
  assetRequirements: SceneAssetRequirement[],
  assetManifest: AssetManifestEntry[],
  renderPlan: VideoRenderPlan,
  renderPreflight: FfmpegPreflightResult,
  scenePreview: ScenePreviewRenderResult
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
    "## Asset Requirements Summary",
    "",
    `- Total required assets: ${countRequiredAssets(assetRequirements)}`,
    `- single_blur assets: ${countRequiredAssetsByLayout(assetRequirements, "single_blur")}`,
    `- moodboard_3 assets: ${countRequiredAssetsByLayout(assetRequirements, "moodboard_3")}`,
    `- comparison_2 assets: ${countRequiredAssetsByLayout(assetRequirements, "comparison_2")}`,
    `- recap_grid assets: ${countRequiredAssetsByLayout(assetRequirements, "recap_grid")}`
  );

  lines.push(
    "",
    "## Asset Manifest Summary",
    "",
    `- Total manifest slots: ${assetManifest.length}`,
    `- Missing slots: ${countManifestStatus(assetManifest, "missing")}`,
    `- Selected slots: ${countManifestStatus(assetManifest, "selected")}`,
    `- Rejected slots: ${countManifestStatus(assetManifest, "rejected")}`
  );

  lines.push(
    "",
    "## Render Readiness Summary",
    "",
    `- Total scenes: ${renderPlan.summary.totalScenes}`,
    `- Ready scenes: ${renderPlan.summary.readyScenes}`,
    `- Blocked scenes: ${renderPlan.summary.blockedScenes}`,
    `- Total required assets: ${renderPlan.summary.totalRequiredAssets}`,
    `- Selected assets: ${renderPlan.summary.totalSelectedAssets}`,
    `- Missing assets: ${renderPlan.summary.totalMissingAssets}`,
    `- Ready to render: ${renderPlan.summary.readyToRender ? "Yes" : "No"}`
  );

  lines.push(
    "",
    "## FFmpeg Preflight Summary",
    "",
    `- FFmpeg installed: ${renderPreflight.ffmpegInstalled ? "Yes" : "No"}`,
    `- Ready to render: ${renderPreflight.readyToRender ? "Yes" : "No"}`,
    `- Blocking reasons: ${renderPreflight.blockingReasons.length}`
  );

  lines.push(
    "",
    "## Scene Preview Render Summary",
    "",
    `- Attempted: ${scenePreview.attempted ? "Yes" : "No"}`,
    `- Rendered: ${scenePreview.rendered ? "Yes" : "No"}`,
    `- Scene index: ${scenePreview.sceneIndex ?? "None"}`,
    `- Output path: ${scenePreview.outputPath ?? "None"}`,
    `- Reason: ${scenePreview.reason ?? "None"}`
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

function countRequiredAssets(requirements: SceneAssetRequirement[]): number {
  return requirements.reduce((total, requirement) => total + requirement.requiredAssetCount, 0);
}

function countRequiredAssetsByLayout(
  requirements: SceneAssetRequirement[],
  layoutType: VisualTimelineItem["layoutType"]
): number {
  return requirements
    .filter((requirement) => requirement.layoutType === layoutType)
    .reduce((total, requirement) => total + requirement.requiredAssetCount, 0);
}

function countManifestStatus(
  manifest: AssetManifestEntry[],
  status: AssetManifestEntry["status"]
): number {
  return manifest.filter((entry) => entry.status === status).length;
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
