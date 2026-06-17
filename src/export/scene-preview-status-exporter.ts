import type { ScenePreviewRenderResult } from "../render/scene-preview-renderer.js";

export function exportScenePreviewStatus(result: ScenePreviewRenderResult): string {
  const lines = [
    "# Scene Preview Status",
    "",
    `- Attempted: ${result.attempted ? "Yes" : "No"}`,
    `- Rendered: ${result.rendered ? "Yes" : "No"}`,
    `- Scene index: ${result.sceneIndex ?? "None"}`,
    `- Output path: ${result.outputPath ?? "None"}`,
    `- Reason: ${result.reason ?? "None"}`,
    `- FFmpeg command: ${result.ffmpegCommand ?? "None"}`
  ];

  return lines.join("\n") + "\n";
}
