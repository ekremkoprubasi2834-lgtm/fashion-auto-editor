import type { FinalPreviewResult } from "../render/final-preview-resolver.js";

export function exportFinalPreviewStatus(result: FinalPreviewResult): string {
  const lines = [
    "# Final Preview Status",
    "",
    `- Attempted: ${result.attempted ? "Yes" : "No"}`,
    `- Resolved: ${result.resolved ? "Yes" : "No"}`,
    `- Source path: ${result.sourcePath ?? "None"}`,
    `- Output path: ${result.outputPath ?? "None"}`,
    `- Reason: ${result.reason ?? "None"}`
  ];

  return lines.join("\n") + "\n";
}
