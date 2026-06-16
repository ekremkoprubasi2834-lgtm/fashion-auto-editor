import path from "node:path";
import { config } from "./config.js";
import { exportVisualTimelineCsv } from "./export/csv-exporter.js";
import { exportEditingGuide } from "./export/markdown-exporter.js";
import { exportSrt } from "./export/srt-exporter.js";
import { segmentTranscript } from "./segmentation/segmenter.js";
import { buildVisualTimeline } from "./timeline/timeline-builder.js";
import { DevTranscriptTranscriber } from "./transcription/dev-transcript-transcriber.js";
import { ensureDir, writeTextFile } from "./utils/fs.js";

async function main(): Promise<void> {
  const transcriber = new DevTranscriptTranscriber(config.inputTranscriptPath);
  const transcript = await transcriber.transcribe();
  const segments = segmentTranscript(transcript.text);
  const timeline = buildVisualTimeline(segments);

  await ensureDir(config.outputDir);
  await writeTextFile(path.join(config.outputDir, "transcript.txt"), transcript.text + "\n");
  await writeTextFile(path.join(config.outputDir, "scene_segments.json"), JSON.stringify(segments, null, 2) + "\n");
  await writeTextFile(path.join(config.outputDir, "visual_timeline.csv"), exportVisualTimelineCsv(timeline));
  await writeTextFile(path.join(config.outputDir, "editing_guide.md"), exportEditingGuide(segments, timeline));
  await writeTextFile(path.join(config.outputDir, "subtitles.srt"), exportSrt(segments));

  console.log(`Generated ${segments.length} scene segments from ${transcript.source}.`);
  console.log(`Output written to ${config.outputDir}.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
