import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

export type SubtitleBurnResult = {
  attempted: boolean;
  rendered: boolean;
  inputVideoPath: string | null;
  subtitlePath: string | null;
  outputPath: string | null;
  reason?: string;
  ffmpegCommand?: string;
};

const execFileAsync = promisify(execFile);

const FORCE_STYLE =
  "FontName=Arial,FontSize=28,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=60";

export async function burnSubtitlesIntoPreview(input: {
  inputVideoPath: string | null;
  subtitlePath: string;
  outputPath: string;
}): Promise<SubtitleBurnResult> {
  if (!input.inputVideoPath || !fs.existsSync(input.inputVideoPath)) {
    return {
      attempted: false,
      rendered: false,
      inputVideoPath: null,
      subtitlePath: null,
      outputPath: null,
      reason: "No source video available."
    };
  }

  if (!fs.existsSync(input.subtitlePath)) {
    return {
      attempted: false,
      rendered: false,
      inputVideoPath: input.inputVideoPath,
      subtitlePath: null,
      outputPath: null,
      reason: "output/subtitles.srt not found."
    };
  }

  const burnInput = {
    inputVideoPath: input.inputVideoPath,
    subtitlePath: input.subtitlePath,
    outputPath: input.outputPath
  };
  const styledArgs = buildArgs(burnInput, true);

  try {
    await execFileAsync("ffmpeg", styledArgs);

    return {
      attempted: true,
      rendered: true,
      inputVideoPath: input.inputVideoPath,
      subtitlePath: input.subtitlePath,
      outputPath: input.outputPath,
      ffmpegCommand: formatCommand(styledArgs)
    };
  } catch (styledError) {
    const plainArgs = buildArgs(burnInput, false);

    try {
      await execFileAsync("ffmpeg", plainArgs);

      return {
        attempted: true,
        rendered: true,
        inputVideoPath: input.inputVideoPath,
        subtitlePath: input.subtitlePath,
        outputPath: input.outputPath,
        ffmpegCommand: formatCommand(plainArgs)
      };
    } catch (plainError) {
      const message = plainError instanceof Error ? plainError.message : String(plainError);

      return {
        attempted: true,
        rendered: false,
        inputVideoPath: input.inputVideoPath,
        subtitlePath: input.subtitlePath,
        outputPath: input.outputPath,
        reason: firstLine(message),
        ffmpegCommand: formatCommand(plainArgs)
      };
    }
  }
}

function buildArgs(
  input: { inputVideoPath: string; subtitlePath: string; outputPath: string },
  styled: boolean
): string[] {
  const escapedSubtitlePath = escapeFilterPath(input.subtitlePath);
  const videoFilter = styled
    ? `subtitles=${escapedSubtitlePath}:force_style='${FORCE_STYLE}'`
    : `subtitles=${escapedSubtitlePath}`;

  return [
    "-y",
    "-i",
    input.inputVideoPath,
    "-vf",
    videoFilter,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    input.outputPath
  ];
}

function escapeFilterPath(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function firstLine(message: string): string {
  return message.split("\n")[0].trim();
}

function formatCommand(args: string[]): string {
  return ["ffmpeg", ...args.map(quoteArg)].join(" ");
}

function quoteArg(value: string): string {
  if (/^[A-Za-z0-9_./:=,-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, "\\\"")}"`;
}
