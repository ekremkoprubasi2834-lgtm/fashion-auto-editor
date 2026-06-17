import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

export type VoiceoverMixResult = {
  attempted: boolean;
  rendered: boolean;
  outputPath: string | null;
  reason?: string;
  ffmpegCommand?: string;
};

const execFileAsync = promisify(execFile);

export async function mixVoiceoverIntoRoughCut(input: {
  roughCutPath: string;
  voiceoverPath: string;
  outputPath: string;
}): Promise<VoiceoverMixResult> {
  if (!fs.existsSync(input.roughCutPath)) {
    return {
      attempted: false,
      rendered: false,
      outputPath: null,
      reason: "Rough cut preview not available."
    };
  }

  if (!fs.existsSync(input.voiceoverPath)) {
    return {
      attempted: false,
      rendered: false,
      outputPath: null,
      reason: "Voiceover audio not available."
    };
  }

  const copyArgs = buildArgs(input, "copy");

  try {
    await execFileAsync("ffmpeg", copyArgs);

    return {
      attempted: true,
      rendered: true,
      outputPath: input.outputPath,
      ffmpegCommand: formatCommand(copyArgs)
    };
  } catch (copyError) {
    const fallbackArgs = buildArgs(input, "libx264");

    try {
      await execFileAsync("ffmpeg", fallbackArgs);

      return {
        attempted: true,
        rendered: true,
        outputPath: input.outputPath,
        ffmpegCommand: formatCommand(fallbackArgs)
      };
    } catch (fallbackError) {
      const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

      return {
        attempted: true,
        rendered: false,
        outputPath: input.outputPath,
        reason: message,
        ffmpegCommand: formatCommand(fallbackArgs)
      };
    }
  }
}

function buildArgs(
  input: { roughCutPath: string; voiceoverPath: string; outputPath: string },
  videoCodec: "copy" | "libx264"
): string[] {
  // Pad the voiceover with trailing silence so it is never shorter than the
  // video. Without this, -shortest trims the output to the voiceover length,
  // dropping the final scenes when the voiceover is shorter than the rough cut.
  const args = [
    "-y",
    "-i",
    input.roughCutPath,
    "-i",
    input.voiceoverPath,
    "-filter_complex",
    "[1:a]apad[aout]",
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-c:v",
    videoCodec
  ];

  if (videoCodec === "libx264") {
    args.push("-preset", "ultrafast", "-pix_fmt", "yuv420p");
  }

  args.push("-c:a", "aac", "-shortest", input.outputPath);

  return args;
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
