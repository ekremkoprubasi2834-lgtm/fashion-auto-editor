import type { MusicMixResult } from "../render/music-mixer.js";

export function exportMusicMixStatus(result: MusicMixResult): string {
  const lines = [
    "# Music Mix Status",
    "",
    `- Attempted: ${result.attempted ? "Yes" : "No"}`,
    `- Rendered: ${result.rendered ? "Yes" : "No"}`,
    `- Output path: ${result.outputPath ?? "None"}`,
    `- Reason: ${result.reason ?? "None"}`,
    `- Music volume: ${result.musicVolume ?? "None"}`,
    `- FFmpeg command: ${result.ffmpegCommand ?? "None"}`
  ];

  return lines.join("\n") + "\n";
}
