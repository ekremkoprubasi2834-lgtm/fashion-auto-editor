import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { VideoRenderPlan } from "./render-plan-builder.js";

export type FfmpegPreflightResult = {
  ffmpegInstalled: boolean;
  ffmpegVersion: string | null;
  readyToRender: boolean;
  blockingReasons: string[];
  nextActions: string[];
};

const execFileAsync = promisify(execFile);

export async function runFfmpegPreflight(renderPlan: VideoRenderPlan): Promise<FfmpegPreflightResult> {
  const ffmpeg = await checkFfmpegAvailability();
  const blockingReasons = buildBlockingReasons(ffmpeg.installed, renderPlan);
  const nextActions = buildNextActions(blockingReasons);

  return {
    ffmpegInstalled: ffmpeg.installed,
    ffmpegVersion: ffmpeg.version,
    readyToRender: ffmpeg.installed && renderPlan.summary.readyToRender,
    blockingReasons,
    nextActions
  };
}

async function checkFfmpegAvailability(): Promise<{ installed: boolean; version: string | null }> {
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"]);
    return {
      installed: true,
      version: extractVersion(stdout)
    };
  } catch {
    return {
      installed: false,
      version: null
    };
  }
}

function extractVersion(stdout: string): string | null {
  return stdout.split(/\r?\n/)[0]?.trim() || null;
}

function buildBlockingReasons(ffmpegInstalled: boolean, renderPlan: VideoRenderPlan): string[] {
  const reasons: string[] = [];

  if (!ffmpegInstalled) {
    reasons.push("FFmpeg is not installed or not available in PATH.");
  }

  if (renderPlan.summary.totalMissingAssets > 0) {
    reasons.push(`${renderPlan.summary.totalMissingAssets} asset slots are missing.`);
  }

  if (!renderPlan.summary.readyToRender) {
    reasons.push("Render plan is not ready.");
  }

  return reasons;
}

function buildNextActions(blockingReasons: string[]): string[] {
  if (blockingReasons.length === 0) {
    return ["MP4 render can be enabled."];
  }

  return [
    "Add missing assets to assets/ using the required filename format.",
    "Example: assets/scene-1-left.jpg",
    "Re-run npm run dev.",
    "When all scenes are ready, MP4 render can be enabled."
  ];
}
