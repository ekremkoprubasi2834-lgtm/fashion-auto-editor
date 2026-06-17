import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { SceneRenderPlan, VideoRenderPlan } from "./render-plan-builder.js";

export type ScenePreviewRenderResult = {
  attempted: boolean;
  rendered: boolean;
  sceneIndex: number | null;
  outputPath: string | null;
  reason?: string;
  ffmpegCommand?: string;
};

type FfmpegRenderCommand = {
  args: string[];
  displayCommand: string;
  outputPath: string;
};

const execFileAsync = promisify(execFile);

export async function renderFirstReadyScenePreview(input: {
  renderPlan: VideoRenderPlan;
  outputDir: string;
}): Promise<ScenePreviewRenderResult> {
  const scene = input.renderPlan.scenes.find((item) => item.readyToRender);

  if (!scene) {
    return {
      attempted: false,
      rendered: false,
      sceneIndex: null,
      outputPath: null,
      reason: "No ready scenes found."
    };
  }

  const command = buildFfmpegCommand(scene, input.outputDir);

  if (!command) {
    return {
      attempted: true,
      rendered: false,
      sceneIndex: scene.sceneIndex,
      outputPath: null,
      reason: `Unsupported or incomplete layout for scene ${scene.sceneIndex}.`
    };
  }

  try {
    await execFileAsync("ffmpeg", command.args);
    return {
      attempted: true,
      rendered: true,
      sceneIndex: scene.sceneIndex,
      outputPath: command.outputPath,
      ffmpegCommand: command.displayCommand
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      rendered: false,
      sceneIndex: scene.sceneIndex,
      outputPath: command.outputPath,
      reason: message,
      ffmpegCommand: command.displayCommand
    };
  }
}

function buildFfmpegCommand(scene: SceneRenderPlan, outputDir: string): FfmpegRenderCommand | null {
  const outputPath = path.join(outputDir, `scene_preview_scene-${scene.sceneIndex}.mp4`);
  const duration = Math.max(1, estimateDurationSeconds(scene));
  const selectedAssets = scene.assets.filter((asset) => asset.status === "selected" && asset.localPath);
  const args = ["-y"];

  for (const asset of selectedAssets) {
    args.push("-loop", "1", "-t", String(duration), "-i", asset.localPath ?? "");
  }

  const filter = buildFilter(scene.layoutType);

  if (!filter || selectedAssets.length !== filter.inputCount) {
    return null;
  }

  args.push(
    "-filter_complex",
    filter.filterComplex,
    "-map",
    "[v]",
    "-t",
    String(duration),
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outputPath
  );

  return {
    args,
    displayCommand: ["ffmpeg", ...args.map(quoteArg)].join(" "),
    outputPath
  };
}

function buildFilter(layoutType: string): { inputCount: number; filterComplex: string } | null {
  switch (layoutType) {
    case "moodboard_3":
      return {
        inputCount: 3,
        filterComplex: [
          "[0:v]scale=640:1080:force_original_aspect_ratio=increase,crop=640:1080,setsar=1[left]",
          "[1:v]scale=640:1080:force_original_aspect_ratio=increase,crop=640:1080,setsar=1[center]",
          "[2:v]scale=640:1080:force_original_aspect_ratio=increase,crop=640:1080,setsar=1[right]",
          "[left][center][right]hstack=inputs=3,scale=1920:1080:out_range=tv,format=yuv420p[v]"
        ].join(";")
      };
    case "comparison_2":
      return {
        inputCount: 2,
        filterComplex: [
          "[0:v]scale=960:1080:force_original_aspect_ratio=increase,crop=960:1080,setsar=1[before]",
          "[1:v]scale=960:1080:force_original_aspect_ratio=increase,crop=960:1080,setsar=1[after]",
          "[before][after]hstack=inputs=2,scale=1920:1080:out_range=tv,format=yuv420p[v]"
        ].join(";")
      };
    case "single_blur":
      return {
        inputCount: 1,
        filterComplex: "[0:v]scale=1920:1080:force_original_aspect_ratio=increase:out_range=tv,crop=1920:1080,setsar=1,format=yuv420p[v]"
      };
    case "recap_grid":
      return {
        inputCount: 4,
        filterComplex: [
          "[0:v]scale=960:540:force_original_aspect_ratio=increase,crop=960:540,setsar=1[top_left]",
          "[1:v]scale=960:540:force_original_aspect_ratio=increase,crop=960:540,setsar=1[top_right]",
          "[2:v]scale=960:540:force_original_aspect_ratio=increase,crop=960:540,setsar=1[bottom_left]",
          "[3:v]scale=960:540:force_original_aspect_ratio=increase,crop=960:540,setsar=1[bottom_right]",
          "[top_left][top_right]hstack=inputs=2[top]",
          "[bottom_left][bottom_right]hstack=inputs=2[bottom]",
          "[top][bottom]vstack=inputs=2,scale=1920:1080:out_range=tv,format=yuv420p[v]"
        ].join(";")
      };
    default:
      return null;
  }
}

function estimateDurationSeconds(scene: SceneRenderPlan): number {
  const start = parseClockSeconds(scene.startTime);
  const end = parseClockSeconds(scene.endTime);

  if (start === null || end === null || end <= start) {
    return 6;
  }

  return Math.max(1, Math.ceil(end - start));
}

function parseClockSeconds(value: string): number | null {
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));

  if (parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

function quoteArg(value: string): string {
  if (/^[A-Za-z0-9_./:=,-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, "\\\"")}"`;
}
