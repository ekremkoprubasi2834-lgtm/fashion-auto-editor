import type { FfmpegPreflightResult } from "../render/ffmpeg-preflight.js";
import type { VideoRenderPlan } from "../render/render-plan-builder.js";

export function exportRenderPreflight(
  preflight: FfmpegPreflightResult,
  renderPlan: VideoRenderPlan
): string {
  const lines: string[] = [
    "# Render Preflight",
    "",
    "## FFmpeg Availability",
    "",
    `- FFmpeg installed: ${preflight.ffmpegInstalled ? "Yes" : "No"}`,
    `- FFmpeg version: ${preflight.ffmpegVersion ?? "Not available"}`
  ];

  if (!preflight.ffmpegInstalled) {
    lines.push("- FFmpeg must be installed and available in PATH before MP4 render can run.");
  }

  lines.push(
    "",
    "## Render Plan Readiness",
    "",
    `- Ready to render: ${preflight.readyToRender ? "Yes" : "No"}`,
    `- Total scenes: ${renderPlan.summary.totalScenes}`,
    `- Ready scenes: ${renderPlan.summary.readyScenes}`,
    `- Blocked scenes: ${renderPlan.summary.blockedScenes}`,
    `- Total required assets: ${renderPlan.summary.totalRequiredAssets}`,
    `- Selected assets: ${renderPlan.summary.totalSelectedAssets}`,
    `- Missing assets: ${renderPlan.summary.totalMissingAssets}`,
    "",
    "## Blocking Reasons",
    ""
  );

  if (preflight.blockingReasons.length === 0) {
    lines.push("- None");
  } else {
    lines.push(...preflight.blockingReasons.map((reason) => `- ${reason}`));
  }

  lines.push(
    "",
    "## Next Actions",
    "",
    ...preflight.nextActions.map((action) => `- ${action}`)
  );

  return lines.join("\n") + "\n";
}
