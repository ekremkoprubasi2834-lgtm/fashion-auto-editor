import type { VisualTimelineItem } from "../timeline/timeline-builder.js";

const HEADERS = [
  "start_time",
  "end_time",
  "section",
  "spoken_text",
  "visual_intent",
  "suggested_asset_folder",
  "search_keywords"
];

export function exportVisualTimelineCsv(items: VisualTimelineItem[]): string {
  const rows = items.map((item) => [
    item.startTime,
    item.endTime,
    item.section,
    item.spokenText,
    item.visualIntent,
    item.suggestedAssetFolder,
    item.searchKeywords.join("; ")
  ]);

  return [HEADERS, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n") + "\n";
}

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, " ").trim();
  return `"${normalized.replace(/"/g, '""')}"`;
}
