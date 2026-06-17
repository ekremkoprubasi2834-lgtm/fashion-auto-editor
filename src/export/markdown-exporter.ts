import type { AssetManifestEntry } from "../assets/asset-manifest-builder.js";
import type { SceneAssetRequirement } from "../assets/asset-requirements-builder.js";
import type { FfmpegPreflightResult } from "../render/ffmpeg-preflight.js";
import type { SceneSegment } from "../segmentation/segmenter.js";
import type { VideoRenderPlan } from "../render/render-plan-builder.js";
import type { RoughCutRenderResult } from "../render/rough-cut-renderer.js";
import type { VisualTimelineItem } from "../timeline/timeline-builder.js";
import { formatDurationRange } from "../utils/time.js";

export function exportEditingGuide(
  segments: SceneSegment[],
  timeline: VisualTimelineItem[],
  assetRequirements: SceneAssetRequirement[],
  assetManifest: AssetManifestEntry[],
  renderPlan: VideoRenderPlan,
  renderPreflight: FfmpegPreflightResult,
  roughCutPreview: RoughCutRenderResult,
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
    "- Asset slots are tracked in output/asset_manifest.json",
    "- Render plan: output/render_plan.json",
    "- Render preflight: output/render_preflight.md",
    "- Scene preview status: output/scene_preview_status.md",
    "- Rough cut preview: output/rough_cut_preview.mp4",
    "- Rough cut status: output/rough_cut_status.md",
    "- Rough cut with voiceover: output/rough_cut_with_voiceover.mp4",
    "- Voiceover mix status: output/voiceover_mix_status.md",
    "- Rough cut with voiceover and music: output/rough_cut_with_voiceover_and_music.mp4",
    "- Music mix status: output/music_mix_status.md",
    "- Final preview with subtitles: output/final_preview_with_subtitles.mp4",
    "- Subtitle burn status: output/subtitle_burn_status.md",
    "- Final preview: output/final_preview.mp4",
    "- Final preview status: output/final_preview_status.md",
    `- Ready to render: ${renderPlan.summary.readyToRender ? "Yes" : "No"}`,
    `- FFmpeg installed: ${renderPreflight.ffmpegInstalled ? "Yes" : "No"}`,
    `- Rough cut rendered: ${roughCutPreview.rendered ? "Yes" : "No"}`,
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

  appendChapterScenes(lines, "Intro", segments, timeline, assetRequirements, assetManifest);
  appendMainContent(lines, segments, timeline, assetRequirements, assetManifest);
  appendChapterScenes(lines, "Outro", segments, timeline, assetRequirements, assetManifest);

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
  timeline: VisualTimelineItem[],
  assetRequirements: SceneAssetRequirement[],
  assetManifest: AssetManifestEntry[]
): void {
  const chapterSegments = segments.filter((segment) => segment.chapter === chapter);

  if (chapterSegments.length === 0) {
    return;
  }

  lines.push(`# Chapter: ${chapter}`, "");

  for (const segment of chapterSegments) {
    appendScene(lines, segment, timeline[segment.id - 1], assetRequirements[segment.id - 1], assetManifest);
  }
}

function appendMainContent(
  lines: string[],
  segments: SceneSegment[],
  timeline: VisualTimelineItem[],
  assetRequirements: SceneAssetRequirement[],
  assetManifest: AssetManifestEntry[]
): void {
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
      appendScene(lines, segment, timeline[segment.id - 1], assetRequirements[segment.id - 1], assetManifest);
    }
  }
}

function appendScene(
  lines: string[],
  segment: SceneSegment,
  item: VisualTimelineItem,
  assetRequirement: SceneAssetRequirement,
  assetManifest: AssetManifestEntry[]
): void {
  const selectedAssetCount = countSelectedAssets(assetManifest, segment);

  lines.push(
    `### Scene ${segment.sceneIndex}`,
    "",
    `- Time: ${formatDurationRange(segment.startSeconds, segment.endSeconds)}`,
    `- Spoken text: ${segment.spokenText}`,
    `- Layout: ${item.layoutType}`,
    `- Required assets: ${assetRequirement.requiredAssetCount}`,
    `- Slots: ${assetRequirement.slots.map((slot) => slot.slot).join(", ")}`,
    `- Asset status: ${selectedAssetCount}/${assetRequirement.requiredAssetCount} selected`,
    `- Visual intent: ${item.visualIntent}`,
    `- Suggested asset folder: ${item.suggestedAssetFolder}`,
    `- Search keywords: ${item.searchKeywords.join(", ")}`,
    ""
  );
}

function countSelectedAssets(assetManifest: AssetManifestEntry[], segment: SceneSegment): number {
  return assetManifest.filter((entry) => {
    return entry.chapter === segment.chapter
      && entry.itemIndex === segment.itemIndex
      && entry.sceneIndex === segment.sceneIndex
      && entry.status === "selected";
  }).length;
}
