import path from "node:path";
import { buildAssetManifest } from "./assets/asset-manifest-builder.js";
import { buildAssetRequirements } from "./assets/asset-requirements-builder.js";
import { resolveManualAssets } from "./assets/manual-asset-resolver.js";
import { config } from "./config.js";
import { exportAssetManifest } from "./export/asset-manifest-exporter.js";
import { exportAssetRequirements } from "./export/asset-requirements-exporter.js";
import { exportVisualTimelineCsv } from "./export/csv-exporter.js";
import { exportEditingGuide } from "./export/markdown-exporter.js";
import { exportQualityReport } from "./export/quality-report-exporter.js";
import { exportSceneSegments } from "./export/scene-segments-exporter.js";
import { exportSrt } from "./export/srt-exporter.js";
import { segmentTranscript } from "./segmentation/segmenter.js";
import { buildVisualTimeline } from "./timeline/timeline-builder.js";
import { DevTranscriptTranscriber } from "./transcription/dev-transcript-transcriber.js";
import { OpenAITranscriber } from "./transcription/openai-transcriber.js";
import type { TranscriptResult, Transcriber } from "./transcription/transcriber.js";
import { ensureDir, fileExists, writeTextFile } from "./utils/fs.js";

async function main(): Promise<void> {
  const transcriber = await createTranscriber();
  const transcript = await transcriber.transcribe();
  const segmentation = segmentTranscript(transcript.text);
  const timeline = buildVisualTimeline(segmentation.scenes);
  const assetRequirements = buildAssetRequirements(timeline);
  const assetManifest = resolveManualAssets(buildAssetManifest(assetRequirements), "assets");

  await ensureDir(config.outputDir);
  await writeTextFile(path.join(config.outputDir, "transcript.txt"), transcript.text + "\n");
  await writeTextFile(path.join(config.outputDir, "speech_segments.json"), JSON.stringify(transcript.speechSegments, null, 2) + "\n");
  await writeTextFile(path.join(config.outputDir, "scene_segments.json"), JSON.stringify(exportSceneSegments(segmentation, timeline), null, 2) + "\n");
  await writeTextFile(path.join(config.outputDir, "asset_requirements.json"), exportAssetRequirements(assetRequirements));
  await writeTextFile(path.join(config.outputDir, "asset_manifest.json"), exportAssetManifest(assetManifest));
  await writeTextFile(path.join(config.outputDir, "visual_timeline.csv"), exportVisualTimelineCsv(timeline));
  await writeTextFile(path.join(config.outputDir, "editing_guide.md"), exportEditingGuide(segmentation.scenes, timeline, assetRequirements, assetManifest, segmentation.qualityWarnings));
  await writeTextFile(path.join(config.outputDir, "subtitles.srt"), exportSrt(segmentation.scenes));
  await writeTextFile(path.join(config.outputDir, "quality_report.md"), exportQualityReport(transcript, segmentation, timeline, assetRequirements, assetManifest));

  console.log(`Generated ${segmentation.scenes.length} scene segments from ${transcript.source} via ${transcript.provider}.`);
  if (segmentation.qualityWarnings.length > 0) {
    console.warn(`Generated ${segmentation.qualityWarnings.length} quality warning(s).`);
  }
  console.log(`Output written to ${config.outputDir}.`);
}

async function createTranscriber(): Promise<Transcriber> {
  const hasVoiceover = await fileExists(config.inputVoiceoverPath);

  if (hasVoiceover && config.openaiApiKey && config.transcriptionProvider === "openai") {
    return new FallbackTranscriber(
      new OpenAITranscriber(config.inputVoiceoverPath, config.openaiApiKey, config.transcriptionModel),
      new DevTranscriptTranscriber(config.inputTranscriptPath)
    );
  }

  return new DevTranscriptTranscriber(config.inputTranscriptPath);
}

class FallbackTranscriber implements Transcriber {
  constructor(
    private readonly primary: Transcriber,
    private readonly fallback: Transcriber
  ) {}

  async transcribe(): Promise<TranscriptResult> {
    try {
      return await this.primary.transcribe();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: ${message}`);
      console.warn("Falling back to input/transcript.txt.");
      return this.fallback.transcribe();
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
