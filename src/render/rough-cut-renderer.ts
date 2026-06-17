import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { RenderPlanAsset, SceneRenderPlan, VideoRenderPlan } from "./render-plan-builder.js";

export type RoughCutRenderResult = {
  attempted: boolean;
  rendered: boolean;
  outputPath: string | null;
  totalScenes: number;
  placeholderScenes: number;
  realAssetScenes: number;
  ffmpegCommand?: string;
  reason?: string;
};

type SceneCommand = {
  args: string[];
  outputPath: string;
};

type LayoutSpec = {
  panelSize: string;
  filterComplex: string;
};

const execFileAsync = promisify(execFile);

export async function renderRoughCutPreview(input: {
  renderPlan: VideoRenderPlan;
  outputDir: string;
}): Promise<RoughCutRenderResult> {
  const outputPath = path.join(input.outputDir, "rough_cut_preview.mp4");
  const tmpDir = path.join(input.outputDir, ".tmp");
  const concatListPath = path.join(tmpDir, "rough_cut_concat.txt");

  if (input.renderPlan.scenes.length === 0) {
    return {
      attempted: false,
      rendered: false,
      outputPath: null,
      totalScenes: 0,
      placeholderScenes: 0,
      realAssetScenes: 0,
      reason: "No scenes found."
    };
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const sceneOutputPaths: string[] = [];

    for (const scene of input.renderPlan.scenes) {
      const command = buildSceneCommand(scene, tmpDir);
      await execFileAsync("ffmpeg", command.args);
      sceneOutputPaths.push(command.outputPath);
    }

    fs.writeFileSync(
      concatListPath,
      sceneOutputPaths.map((filePath) => `file '${path.resolve(filePath).replace(/'/g, "'\\''")}'`).join("\n") + "\n",
      "utf8"
    );

    const concatArgs = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      outputPath
    ];

    await execFileAsync("ffmpeg", concatArgs);

    return {
      attempted: true,
      rendered: true,
      outputPath,
      totalScenes: input.renderPlan.scenes.length,
      placeholderScenes: countPlaceholderScenes(input.renderPlan.scenes),
      realAssetScenes: countRealAssetScenes(input.renderPlan.scenes),
      ffmpegCommand: ["ffmpeg", ...concatArgs.map(quoteArg)].join(" ")
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      attempted: true,
      rendered: false,
      outputPath,
      totalScenes: input.renderPlan.scenes.length,
      placeholderScenes: countPlaceholderScenes(input.renderPlan.scenes),
      realAssetScenes: countRealAssetScenes(input.renderPlan.scenes),
      reason: message
    };
  }
}

function buildSceneCommand(scene: SceneRenderPlan, tmpDir: string): SceneCommand {
  const outputPath = path.join(tmpDir, `scene-${scene.sceneIndex}.mp4`);
  const duration = Math.max(3, estimateDurationSeconds(scene));
  const layout = buildLayoutSpec(scene.layoutType);

  if (!layout) {
    throw new Error(`Unsupported layout type: ${scene.layoutType}`);
  }

  const args = ["-y"];

  for (const asset of scene.assets) {
    if (asset.status === "selected" && asset.localPath) {
      args.push("-loop", "1", "-t", String(duration), "-i", asset.localPath);
    } else {
      args.push("-f", "lavfi", "-t", String(duration), "-i", `color=c=0x2f3338:s=${layout.panelSize}:r=30`);
    }
  }

  args.push(
    "-filter_complex",
    layout.filterComplex,
    "-map",
    "[v]",
    "-t",
    String(duration),
    "-r",
    "30",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    outputPath
  );

  return { args, outputPath };
}

function buildLayoutSpec(layoutType: string): LayoutSpec | null {
  switch (layoutType) {
    case "moodboard_3":
      return {
        panelSize: "640x1080",
        filterComplex: [
          "[0:v]scale=640:1080:force_original_aspect_ratio=increase,crop=640:1080,setsar=1[left]",
          "[1:v]scale=640:1080:force_original_aspect_ratio=increase,crop=640:1080,setsar=1[center]",
          "[2:v]scale=640:1080:force_original_aspect_ratio=increase,crop=640:1080,setsar=1[right]",
          "[left][center][right]hstack=inputs=3,scale=1920:1080:out_range=tv,format=yuv420p[v]"
        ].join(";")
      };
    case "comparison_2":
      return {
        panelSize: "960x1080",
        filterComplex: [
          "[0:v]scale=960:1080:force_original_aspect_ratio=increase,crop=960:1080,setsar=1[before]",
          "[1:v]scale=960:1080:force_original_aspect_ratio=increase,crop=960:1080,setsar=1[after]",
          "[before][after]hstack=inputs=2,scale=1920:1080:out_range=tv,format=yuv420p[v]"
        ].join(";")
      };
    case "single_blur":
      return {
        panelSize: "1920x1080",
        filterComplex: "[0:v]scale=1920:1080:force_original_aspect_ratio=increase:out_range=tv,crop=1920:1080,setsar=1,format=yuv420p[v]"
      };
    case "recap_grid":
      return {
        panelSize: "960x540",
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

function countPlaceholderScenes(scenes: SceneRenderPlan[]): number {
  return scenes.filter((scene) => scene.assets.some((asset) => asset.status !== "selected")).length;
}

function countRealAssetScenes(scenes: SceneRenderPlan[]): number {
  return scenes.filter((scene) => scene.assets.every((asset) => asset.status === "selected")).length;
}

function estimateDurationSeconds(scene: SceneRenderPlan): number {
  const start = parseClockSeconds(scene.startTime);
  const end = parseClockSeconds(scene.endTime);

  if (start === null || end === null || end <= start) {
    return 6;
  }

  return Math.max(3, Math.ceil(end - start));
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
