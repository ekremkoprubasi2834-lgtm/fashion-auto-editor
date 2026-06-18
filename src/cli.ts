import path from "node:path";
import { buildAssetManifest } from "./assets/asset-manifest-builder.js";
import { buildAssetRequirements } from "./assets/asset-requirements-builder.js";
import {
  describeRenderGate,
  evaluateRenderGate,
  runAssetAudit,
  runAssetPrepare,
  runAssetQueries
} from "./assets/asset-collector.js";
import {
  runPinterestAuth,
  runPinterestBoards,
  runPinterestCollect
} from "./assets/providers/pinterest-provider.js";
import {
  runMoodboardCollect,
  runMoodboardLinks
} from "./assets/providers/fashion-moodboard-collector.js";
import {
  runMoodboardApprove,
  runMoodboardReview
} from "./assets/providers/fashion-moodboard-review.js";
import { runMoodboardScore } from "./assets/providers/fashion-moodboard-score.js";
import { loadSectionAssetPools, resolveManualAssets } from "./assets/manual-asset-resolver.js";
import { config } from "./config.js";
import { exportAssetManifest } from "./export/asset-manifest-exporter.js";
import { exportAssetRequirements } from "./export/asset-requirements-exporter.js";
import { exportVisualTimelineCsv } from "./export/csv-exporter.js";
import { exportEditingGuide } from "./export/markdown-exporter.js";
import { exportQualityReport } from "./export/quality-report-exporter.js";
import { exportRenderPreflight } from "./export/render-preflight-exporter.js";
import { exportRenderPlan } from "./export/render-plan-exporter.js";
import { exportRoughCutStatus } from "./export/rough-cut-status-exporter.js";
import { exportSceneSegments } from "./export/scene-segments-exporter.js";
import { exportScenePreviewStatus } from "./export/scene-preview-status-exporter.js";
import { exportSrt } from "./export/srt-exporter.js";
import { exportVoiceoverMixStatus } from "./export/voiceover-mix-status-exporter.js";
import { exportMusicMixStatus } from "./export/music-mix-status-exporter.js";
import { exportSubtitleBurnStatus } from "./export/subtitle-burn-status-exporter.js";
import { exportFinalPreviewStatus } from "./export/final-preview-status-exporter.js";
import { runFfmpegPreflight } from "./render/ffmpeg-preflight.js";
import { probeMediaDurationSeconds } from "./render/media-duration.js";
import { buildRenderPlan } from "./render/render-plan-builder.js";
import { renderRoughCutPreview, type RoughCutRenderResult } from "./render/rough-cut-renderer.js";
import { renderFirstReadyScenePreview, type ScenePreviewRenderResult } from "./render/scene-preview-renderer.js";
import { mixVoiceoverIntoRoughCut, type VoiceoverMixResult } from "./render/voiceover-mixer.js";
import { mixMusicIntoVoiceoverCut, type MusicMixResult } from "./render/music-mixer.js";
import { burnSubtitlesIntoPreview, type SubtitleBurnResult } from "./render/subtitle-burner.js";
import { resolveFinalPreview, type FinalPreviewResult } from "./render/final-preview-resolver.js";
import { segmentTranscript } from "./segmentation/segmenter.js";
import { buildVisualTimeline } from "./timeline/timeline-builder.js";
import { CachingTranscriber } from "./transcription/caching-transcriber.js";
import { DevTranscriptTranscriber } from "./transcription/dev-transcript-transcriber.js";
import { OpenAITranscriber } from "./transcription/openai-transcriber.js";
import type { TranscriptResult, Transcriber } from "./transcription/transcriber.js";
import { ensureDir, fileExists, writeTextFile } from "./utils/fs.js";

async function main(): Promise<void> {
  const transcriber = await createTranscriber();
  const transcript = await transcriber.transcribe();
  const segmentation = segmentTranscript(transcript.text);
  const voiceoverDurationSeconds = await probeMediaDurationSeconds(config.inputVoiceoverPath);
  const sectionAssetPools = loadSectionAssetPools("assets");
  const timeline = buildVisualTimeline(segmentation.scenes, {
    targetDurationSeconds: voiceoverDurationSeconds ?? undefined,
    sectionAssetCount: (section) => sectionAssetPools.countFor(section)
  });
  const assetRequirements = buildAssetRequirements(timeline);
  const assetManifest = resolveManualAssets(buildAssetManifest(assetRequirements), "assets");
  const renderPlan = buildRenderPlan({ timelineItems: timeline, manifest: assetManifest });
  const renderPreflight = await runFfmpegPreflight(renderPlan);

  await ensureDir(config.outputDir);

  // Render gate: no final video is produced until every section reaches its
  // minimum distinct-asset count. This is what turns the project from "render
  // whatever 12 images we have" into a real asset-gated pipeline.
  const renderGate = evaluateRenderGate("assets");
  const renderBlockedReason = renderGate.renderAllowed
    ? null
    : renderGate.blockingReason ?? "INSUFFICIENT_ASSETS — render blocked (section asset minimums not met).";
  const canRender = renderPreflight.ffmpegInstalled && renderGate.renderAllowed;

  if (renderBlockedReason) {
    console.error(renderBlockedReason);
    for (const line of describeRenderGate(renderGate)) {
      console.error(line);
    }
    console.error("Run `npm run assets:audit` / `npm run assets:prepare` to fill the pools.");
  }

  const scenePreview = canRender
    ? await renderFirstReadyScenePreview({ renderPlan, outputDir: config.outputDir })
    : createSkippedScenePreview(renderBlockedReason ?? "FFmpeg is not installed or not available in PATH.");
  const roughCutPreview = canRender
    ? await renderRoughCutPreview({ renderPlan, outputDir: config.outputDir })
    : createSkippedRoughCutPreview(renderPlan.summary.totalScenes, renderBlockedReason ?? "FFmpeg is not installed or not available in PATH.");

  const voiceoverMix = await resolveVoiceoverMix(roughCutPreview);
  const musicMix = await resolveMusicMix(voiceoverMix);

  const subtitlePath = path.join(config.outputDir, "subtitles.srt");
  await writeTextFile(subtitlePath, exportSrt(segmentation.scenes));
  const subtitleBurn = await resolveSubtitleBurn(roughCutPreview, voiceoverMix, musicMix, subtitlePath);

  const finalPreview = await resolveFinalPreview({
    candidates: [
      ...(config.enableSubtitleBurn ? [path.join(config.outputDir, "final_preview_with_subtitles.mp4")] : []),
      path.join(config.outputDir, "rough_cut_with_voiceover_and_music.mp4"),
      path.join(config.outputDir, "rough_cut_with_voiceover.mp4"),
      path.join(config.outputDir, "rough_cut_preview.mp4")
    ],
    outputPath: path.join(config.outputDir, "final_preview.mp4")
  });

  await writeTextFile(path.join(config.outputDir, "transcript.txt"), transcript.text + "\n");
  await writeTextFile(path.join(config.outputDir, "speech_segments.json"), JSON.stringify(transcript.speechSegments, null, 2) + "\n");
  await writeTextFile(path.join(config.outputDir, "scene_segments.json"), JSON.stringify(exportSceneSegments(segmentation, timeline), null, 2) + "\n");
  await writeTextFile(path.join(config.outputDir, "asset_requirements.json"), exportAssetRequirements(assetRequirements));
  await writeTextFile(path.join(config.outputDir, "asset_manifest.json"), exportAssetManifest(assetManifest));
  await writeTextFile(path.join(config.outputDir, "render_plan.json"), exportRenderPlan(renderPlan));
  await writeTextFile(path.join(config.outputDir, "render_preflight.md"), exportRenderPreflight(renderPreflight, renderPlan));
  await writeTextFile(path.join(config.outputDir, "scene_preview_status.md"), exportScenePreviewStatus(scenePreview));
  await writeTextFile(path.join(config.outputDir, "rough_cut_status.md"), exportRoughCutStatus(roughCutPreview));
  await writeTextFile(path.join(config.outputDir, "voiceover_mix_status.md"), exportVoiceoverMixStatus(voiceoverMix));
  await writeTextFile(path.join(config.outputDir, "music_mix_status.md"), exportMusicMixStatus(musicMix));
  await writeTextFile(path.join(config.outputDir, "subtitle_burn_status.md"), exportSubtitleBurnStatus(subtitleBurn));
  await writeTextFile(path.join(config.outputDir, "final_preview_status.md"), exportFinalPreviewStatus(finalPreview));
  await writeTextFile(path.join(config.outputDir, "visual_timeline.csv"), exportVisualTimelineCsv(timeline));
  await writeTextFile(path.join(config.outputDir, "editing_guide.md"), exportEditingGuide(segmentation.scenes, timeline, assetRequirements, assetManifest, renderPlan, renderPreflight, roughCutPreview, segmentation.qualityWarnings));
  await writeTextFile(path.join(config.outputDir, "quality_report.md"), exportQualityReport(transcript, segmentation, timeline, assetRequirements, assetManifest, renderPlan, renderPreflight, scenePreview, roughCutPreview, voiceoverMix, musicMix, subtitleBurn, finalPreview));

  console.log(`Generated ${segmentation.scenes.length} scene segments from ${transcript.source} via ${transcript.provider}.`);
  if (segmentation.qualityWarnings.length > 0) {
    console.warn(`Generated ${segmentation.qualityWarnings.length} quality warning(s).`);
  }
  console.log(`Output written to ${config.outputDir}.`);
}

function createSkippedScenePreview(reason: string): ScenePreviewRenderResult {
  return {
    attempted: false,
    rendered: false,
    sceneIndex: null,
    outputPath: null,
    reason
  };
}

async function resolveVoiceoverMix(roughCutPreview: RoughCutRenderResult): Promise<VoiceoverMixResult> {
  if (!roughCutPreview.rendered || !roughCutPreview.outputPath) {
    return {
      attempted: false,
      rendered: false,
      outputPath: null,
      reason: "Rough cut preview not available."
    };
  }

  if (!(await fileExists(config.inputVoiceoverPath))) {
    return {
      attempted: false,
      rendered: false,
      outputPath: null,
      reason: "Voiceover audio not available."
    };
  }

  return mixVoiceoverIntoRoughCut({
    roughCutPath: roughCutPreview.outputPath,
    voiceoverPath: config.inputVoiceoverPath,
    outputPath: path.join(config.outputDir, "rough_cut_with_voiceover.mp4")
  });
}

async function resolveMusicMix(voiceoverMix: VoiceoverMixResult): Promise<MusicMixResult> {
  if (!voiceoverMix.rendered || !voiceoverMix.outputPath) {
    return {
      attempted: false,
      rendered: false,
      outputPath: null,
      reason: "Voiceover cut not available."
    };
  }

  if (!(await fileExists(config.inputMusicPath))) {
    return {
      attempted: false,
      rendered: false,
      outputPath: null,
      reason: "input/music.mp3 not found."
    };
  }

  return mixMusicIntoVoiceoverCut({
    voiceoverCutPath: voiceoverMix.outputPath,
    musicPath: config.inputMusicPath,
    outputPath: path.join(config.outputDir, "rough_cut_with_voiceover_and_music.mp4")
  });
}

function selectBestVideoSource(
  roughCutPreview: RoughCutRenderResult,
  voiceoverMix: VoiceoverMixResult,
  musicMix: MusicMixResult
): string | null {
  if (musicMix.rendered && musicMix.outputPath) {
    return musicMix.outputPath;
  }

  if (voiceoverMix.rendered && voiceoverMix.outputPath) {
    return voiceoverMix.outputPath;
  }

  if (roughCutPreview.rendered && roughCutPreview.outputPath) {
    return roughCutPreview.outputPath;
  }

  return null;
}

async function resolveSubtitleBurn(
  roughCutPreview: RoughCutRenderResult,
  voiceoverMix: VoiceoverMixResult,
  musicMix: MusicMixResult,
  subtitlePath: string
): Promise<SubtitleBurnResult> {
  if (!config.enableSubtitleBurn) {
    return {
      attempted: false,
      rendered: false,
      inputVideoPath: null,
      subtitlePath: null,
      outputPath: null,
      reason: "Subtitle burn disabled by config."
    };
  }

  const inputVideoPath = selectBestVideoSource(roughCutPreview, voiceoverMix, musicMix);

  if (!inputVideoPath) {
    return {
      attempted: false,
      rendered: false,
      inputVideoPath: null,
      subtitlePath: null,
      outputPath: null,
      reason: "No source video available."
    };
  }

  return burnSubtitlesIntoPreview({
    inputVideoPath,
    subtitlePath,
    outputPath: path.join(config.outputDir, "final_preview_with_subtitles.mp4")
  });
}

function createSkippedRoughCutPreview(totalScenes: number, reason: string): RoughCutRenderResult {
  return {
    attempted: false,
    rendered: false,
    outputPath: null,
    totalScenes,
    placeholderScenes: 0,
    realAssetScenes: 0,
    reason
  };
}

async function createTranscriber(): Promise<Transcriber> {
  const hasVoiceover = await fileExists(config.inputVoiceoverPath);

  if (hasVoiceover && config.openaiApiKey && config.transcriptionProvider === "openai") {
    return new CachingTranscriber(
      new FallbackTranscriber(
        new OpenAITranscriber(config.inputVoiceoverPath, config.openaiApiKey, config.transcriptionModel),
        new DevTranscriptTranscriber(config.inputTranscriptPath)
      ),
      config.inputVoiceoverPath,
      config.transcriptionModel,
      config.transcriptCachePath
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

async function runCommand(command: string | undefined): Promise<void> {
  switch (command) {
    case "assets:queries":
      await runAssetQueries();
      return;
    case "assets:audit":
      await runAssetAudit();
      return;
    case "assets:prepare":
      await runAssetPrepare();
      return;
    case "pinterest:auth":
      await runPinterestAuth(readFlagValue("--code"));
      return;
    case "pinterest:boards":
      await runPinterestBoards();
      return;
    case "pinterest:collect":
      await runPinterestCollect({ download: hasFlag("--download") });
      return;
    case "moodboard:links":
      await runMoodboardLinks();
      return;
    case "moodboard:collect":
      await runMoodboardCollect(process.argv.slice(3));
      return;
    case "moodboard:review":
      await runMoodboardReview(process.argv.slice(3));
      return;
    case "moodboard:approve":
      await runMoodboardApprove(process.argv.slice(3));
      return;
    case "moodboard:score":
      await runMoodboardScore(process.argv.slice(3));
      return;
    case undefined:
    case "dev":
    case "render":
      await main();
      return;
    default:
      throw new Error(
        `Unknown command "${command}". Use one of: assets:queries | assets:audit | assets:prepare | ` +
          `pinterest:auth | pinterest:boards | pinterest:collect | moodboard:links | moodboard:collect | ` +
          `moodboard:review | moodboard:approve | moodboard:score | (default render).`
      );
  }
}

function hasFlag(flag: string): boolean {
  return process.argv.slice(3).includes(flag);
}

function readFlagValue(flag: string): string | undefined {
  const args = process.argv.slice(3);
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

runCommand(process.argv[2]).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
