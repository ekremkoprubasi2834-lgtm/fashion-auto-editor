import type { SubtitleBurnResult } from "../render/subtitle-burner.js";

export function exportSubtitleBurnStatus(result: SubtitleBurnResult): string {
  const lines = [
    "# Subtitle Burn Status",
    "",
    `- Attempted: ${result.attempted ? "Yes" : "No"}`,
    `- Rendered: ${result.rendered ? "Yes" : "No"}`,
    `- Input video: ${result.inputVideoPath ?? "None"}`,
    `- Subtitle path: ${result.subtitlePath ?? "None"}`,
    `- Output path: ${result.outputPath ?? "None"}`,
    `- Reason: ${result.reason ?? "None"}`,
    `- FFmpeg command: ${result.ffmpegCommand ?? "None"}`
  ];

  return lines.join("\n") + "\n";
}
