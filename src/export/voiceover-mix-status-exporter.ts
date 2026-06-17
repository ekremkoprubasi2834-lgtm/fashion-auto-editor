import type { VoiceoverMixResult } from "../render/voiceover-mixer.js";

export function exportVoiceoverMixStatus(result: VoiceoverMixResult): string {
  const lines = [
    "# Voiceover Mix Status",
    "",
    `- Attempted: ${result.attempted ? "Yes" : "No"}`,
    `- Rendered: ${result.rendered ? "Yes" : "No"}`,
    `- Output path: ${result.outputPath ?? "None"}`,
    `- Reason: ${result.reason ?? "None"}`,
    `- FFmpeg command: ${result.ffmpegCommand ?? "None"}`
  ];

  return lines.join("\n") + "\n";
}
