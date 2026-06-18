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

// Premium title-card styling. Serif title over a deep warm-charcoal card with a
// small gold eyebrow line and a thin gold rule — large and readable at 1080p.
const TITLE_CARD_BG = "0x16130F";
const TITLE_CARD_KICKER_COLOR = "0xC9A24B";
const TITLE_CARD_TITLE_COLOR = "0xF4EEE2";
const TITLE_CARD_RULE_COLOR = "0xB89253";
const SERIF_FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Georgia.ttf",
  "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
  "/System/Library/Fonts/Times.ttc"
];
const SANS_FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/System/Library/Fonts/Geneva.ttf"
];

function buildSceneCommand(scene: SceneRenderPlan, tmpDir: string): SceneCommand {
  if (scene.type === "title_card" && scene.titleCard) {
    return buildTitleCardCommand(scene, tmpDir);
  }

  const outputPath = path.join(tmpDir, `scene-${scene.globalSceneIndex}.mp4`);
  const duration = Math.max(1, estimateDurationSeconds(scene));
  const layout = buildLayoutSpec(scene, duration);

  if (!layout) {
    throw new Error(`Unsupported layout type: ${scene.layoutType}`);
  }

  const args = ["-y"];

  for (const asset of scene.assets) {
    if (asset.status === "selected" && asset.localPath) {
      args.push("-framerate", "30", "-loop", "1", "-t", String(duration), "-i", asset.localPath);
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
    "fast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    outputPath
  );

  return { args, outputPath };
}

function buildTitleCardCommand(scene: SceneRenderPlan, tmpDir: string): SceneCommand {
  const card = scene.titleCard!;
  const outputPath = path.join(tmpDir, `scene-${scene.globalSceneIndex}.mp4`);
  const duration = Math.max(1, estimateDurationSeconds(scene));

  // Text is passed via textfile so umlauts and "&" need no filtergraph escaping.
  const kickerPath = path.join(tmpDir, `title-${scene.globalSceneIndex}-kicker.txt`);
  const titlePath = path.join(tmpDir, `title-${scene.globalSceneIndex}-title.txt`);
  fs.writeFileSync(kickerPath, card.title, "utf8");
  fs.writeFileSync(titlePath, card.subtitle, "utf8");

  const kickerFont = resolveFont(SANS_FONT_CANDIDATES);
  const titleFont = resolveFont(SERIF_FONT_CANDIDATES);

  const filterComplex = [
    `[0:v]drawbox=x=(iw-260)/2:y=ih/2-70:w=260:h=2:color=${TITLE_CARD_RULE_COLOR}@1:t=fill`,
    `drawtext=textfile=${kickerPath}:fontfile=${kickerFont}:fontcolor=${TITLE_CARD_KICKER_COLOR}:fontsize=54:x=(w-text_w)/2:y=(h/2)-150`,
    `drawtext=textfile=${titlePath}:fontfile=${titleFont}:fontcolor=${TITLE_CARD_TITLE_COLOR}:fontsize=104:x=(w-text_w)/2:y=(h/2)-30`,
    `format=yuv420p`,
    `setsar=1[v]`
  ].join(",");

  const args = [
    "-y",
    "-f",
    "lavfi",
    "-t",
    String(duration),
    "-i",
    `color=c=${TITLE_CARD_BG}:s=1920x1080:r=30`,
    "-filter_complex",
    filterComplex,
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
    "fast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    outputPath
  ];

  return { args, outputPath };
}

function resolveFont(candidates: string[]): string {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function buildLayoutSpec(scene: SceneRenderPlan, duration: number): LayoutSpec | null {
  switch (scene.layoutType) {
    case "single_focus":
    case "sequence_single":
    case "detail_focus":
    case "single_blur":
      return {
        panelSize: "1920x1080",
        filterComplex: [
          buildPanelChain(0, 1920, 1080, 1820, 1020, "single", scene.motion, duration),
          "[single]format=yuv420p[v]"
        ].join(";")
      };
    case "moodboard_2":
      return {
        panelSize: "960x1080",
        filterComplex: [
          buildPanelChain(0, 960, 1080, 900, 1000, "left", scene.motion, duration, 0),
          buildPanelChain(1, 960, 1080, 900, 1000, "right", scene.motion, duration, 1),
          "[left][right]hstack=inputs=2,scale=1920:1080:flags=lanczos,format=yuv420p[v]"
        ].join(";")
      };
    case "moodboard_3":
      return {
        panelSize: "640x1080",
        filterComplex: [
          buildTopAlignedPanelChain(0, 640, 1080, "left", scene.motion, duration, 0),
          buildTopAlignedPanelChain(1, 640, 1080, "center", scene.motion, duration, 1),
          buildTopAlignedPanelChain(2, 640, 1080, "right", scene.motion, duration, 2),
          "[left][center][right]hstack=inputs=3,scale=1920:1080:flags=lanczos,format=yuv420p[v]"
        ].join(";")
      };
    case "comparison_2":
      return {
        panelSize: "960x1080",
        filterComplex: [
          buildPanelChain(0, 1920, 1080, 1820, 1020, "before_full", scene.motion, duration, 0),
          buildPanelChain(1, 1920, 1080, 1820, 1020, "after_full", scene.motion, duration, 1),
          buildPanelChain(0, 960, 1080, 900, 1000, "before_half", scene.motion, duration, 0),
          buildPanelChain(1, 960, 1080, 900, 1000, "after_half", scene.motion, duration, 1),
          "[before_half][after_half]hstack=inputs=2,scale=1920:1080:flags=lanczos[comparison_side]",
          `[before_full][after_full]overlay=0:0:enable='between(t,${(duration * 0.42).toFixed(2)},${(duration * 0.72).toFixed(2)})'[comparison_stage]`,
          `[comparison_stage][comparison_side]overlay=0:0:enable='gte(t,${(duration * 0.72).toFixed(2)})',format=yuv420p[v]`
        ].join(";")
      };
    case "recap_grid":
      return {
        panelSize: "960x540",
        filterComplex: [
          buildPanelChain(0, 960, 540, 900, 480, "top_left", scene.motion, duration, 0),
          buildPanelChain(1, 960, 540, 900, 480, "top_right", scene.motion, duration, 1),
          buildPanelChain(2, 960, 540, 900, 480, "bottom_left", scene.motion, duration, 2),
          buildPanelChain(3, 960, 540, 900, 480, "bottom_right", scene.motion, duration, 3),
          "[top_left][top_right]hstack=inputs=2[top]",
          "[bottom_left][bottom_right]hstack=inputs=2[bottom]",
          "[top][bottom]vstack=inputs=2,scale=1920:1080:flags=lanczos,format=yuv420p[v]"
        ].join(";")
      };
    default:
      return null;
  }
}

function buildPanelChain(
  index: number,
  panelWidth: number,
  panelHeight: number,
  foregroundWidth: number,
  foregroundHeight: number,
  outLabel: string,
  motion: SceneRenderPlan["motion"],
  duration: number,
  variant = 0
): string {
  const rawLabel = `${outLabel}_raw`;
  const id = `${outLabel}${index}`;

  return [
    `[${index}:v]split=2[bg${id}][fg${id}]`,
    `[bg${id}]scale=${panelWidth}:${panelHeight}:force_original_aspect_ratio=increase:flags=lanczos,crop=${panelWidth}:${panelHeight},boxblur=24:2,eq=brightness=-0.07:saturation=0.92,setsar=1[bgp${id}]`,
    `[fg${id}]scale=${foregroundWidth}:${foregroundHeight}:force_original_aspect_ratio=decrease:flags=lanczos,setsar=1[fgp${id}]`,
    `[bgp${id}][fgp${id}]overlay=(W-w)/2:(H-h)/2[${rawLabel}]`,
    buildMotionFilter(rawLabel, outLabel, panelWidth, panelHeight, motion, duration, variant)
  ].join(";");
}

// Top-anchored panel: foreground fills the panel width and is pinned below a
// fixed top margin, cropping excess from the bottom so subjects' heads land on
// a consistent horizontal band across panels (fashion moodboard look).
function buildTopAlignedPanelChain(
  index: number,
  panelWidth: number,
  panelHeight: number,
  outLabel: string,
  motion: SceneRenderPlan["motion"],
  duration: number,
  variant = 0
): string {
  const topMargin = 40;
  const maxForegroundHeight = panelHeight - topMargin * 2;
  const rawLabel = `${outLabel}_raw`;
  const id = `${outLabel}${index}`;

  return [
    `[${index}:v]split=2[bg${id}][fg${id}]`,
    `[bg${id}]scale=${panelWidth}:${panelHeight}:force_original_aspect_ratio=increase:flags=lanczos,crop=${panelWidth}:${panelHeight},boxblur=24:2,eq=brightness=-0.07:saturation=0.92,setsar=1[bgp${id}]`,
    `[fg${id}]scale=${panelWidth}:-2:flags=lanczos,crop=${panelWidth}:'min(ih,${maxForegroundHeight})':0:0,setsar=1[fgp${id}]`,
    `[bgp${id}][fgp${id}]overlay=(W-w)/2:${topMargin}[${rawLabel}]`,
    buildMotionFilter(rawLabel, outLabel, panelWidth, panelHeight, motion, duration, variant)
  ].join(";");
}

function buildMotionFilter(
  inputLabel: string,
  outputLabel: string,
  width: number,
  height: number,
  motion: SceneRenderPlan["motion"],
  duration: number,
  variant: number
): string {
  const frames = Math.max(1, Math.round(duration * 30));
  const progress = `on/${frames}`;
  const type = variant % 2 === 1 ? invertMotion(motion.type) : motion.type;
  // Keep the zoom delta small and single-directional: 1.00 -> 1.04 (subtle) or
  // 1.00 -> 1.06 (medium). No back-and-forth, no micro shake.
  const zoomRange = motion.intensity === "medium" ? 0.06 : 0.04;

  const centerX = "iw/2-(iw/zoom/2)";
  const centerY = "ih/2-(ih/zoom/2)";
  let zoom = "1";
  let x = centerX;
  let y = centerY;

  switch (type) {
    case "slow_zoom_in":
    case "push_in":
    case "comparison_reveal":
      zoom = `1+${zoomRange.toFixed(3)}*${progress}`;
      break;
    case "slow_zoom_out":
      zoom = `${(1 + zoomRange).toFixed(3)}-${zoomRange.toFixed(3)}*${progress}`;
      break;
    case "pan_left":
      zoom = (1 + zoomRange).toFixed(3);
      x = `(iw-iw/zoom)*(1-${progress})`;
      break;
    case "pan_right":
      zoom = (1 + zoomRange).toFixed(3);
      x = `(iw-iw/zoom)*${progress}`;
      break;
    case "pan_up":
      zoom = (1 + zoomRange).toFixed(3);
      y = `(ih-ih/zoom)*(1-${progress})`;
      break;
    case "pan_down":
      zoom = (1 + zoomRange).toFixed(3);
      y = `(ih-ih/zoom)*${progress}`;
      break;
    case "ken_burns":
      zoom = `1+${zoomRange.toFixed(3)}*${progress}`;
      x = `(iw-iw/zoom)*${progress}`;
      y = `(ih-ih/zoom)*(1-${progress})`;
      break;
  }

  // zoompan rounds its crop origin (x/y) to whole pixels every frame. At these
  // small zoom/pan deltas that rounding makes the image jump 0px/1px between
  // frames, which reads as jitter/shake. Supersampling the panel before
  // zoompan makes each output pixel map to several source pixels, so the
  // sub-pixel motion stays smooth and monotonic. The factor is capped so the
  // intermediate stays around ~3840px on its longest side.
  const supersample = Math.max(2, Math.min(4, Math.floor(3840 / Math.max(width, height))));

  return [
    `[${inputLabel}]scale=${width * supersample}:${height * supersample}:flags=bicubic[${outputLabel}_ss]`,
    `[${outputLabel}_ss]zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=30,setsar=1[${outputLabel}]`
  ].join(";");
}

function invertMotion(type: SceneRenderPlan["motion"]["type"]): SceneRenderPlan["motion"]["type"] {
  switch (type) {
    case "pan_left":
      return "pan_right";
    case "pan_right":
      return "pan_left";
    case "pan_up":
      return "pan_down";
    case "pan_down":
      return "pan_up";
    case "slow_zoom_in":
      return "slow_zoom_out";
    case "slow_zoom_out":
      return "slow_zoom_in";
    default:
      return type;
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

  return Math.max(1, end - start);
}

function parseClockSeconds(value: string): number | null {
  const parts = value.split(":").map((part) => Number.parseFloat(part));

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
