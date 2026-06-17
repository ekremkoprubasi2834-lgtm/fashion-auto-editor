import type { RoughCutRenderResult } from "../render/rough-cut-renderer.js";

export function exportRoughCutStatus(result: RoughCutRenderResult): string {
  const lines = [
    "# Rough Cut Status",
    "",
    `- Attempted: ${result.attempted ? "Yes" : "No"}`,
    `- Rendered: ${result.rendered ? "Yes" : "No"}`,
    `- Output path: ${result.outputPath ?? "None"}`,
    `- Total scenes: ${result.totalScenes}`,
    `- Placeholder scenes: ${result.placeholderScenes}`,
    `- Real asset scenes: ${result.realAssetScenes}`,
    `- Reason: ${result.reason ?? "None"}`,
    `- FFmpeg command: ${result.ffmpegCommand ?? "None"}`
  ];

  return lines.join("\n") + "\n";
}
