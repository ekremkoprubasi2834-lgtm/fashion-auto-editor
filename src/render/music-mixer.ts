import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

export type MusicMixResult = {
  attempted: boolean;
  rendered: boolean;
  outputPath: string | null;
  reason?: string;
  musicVolume?: number;
  ffmpegCommand?: string;
};

const execFileAsync = promisify(execFile);
const DEFAULT_MUSIC_VOLUME = 0.1;

export async function mixMusicIntoVoiceoverCut(input: {
  voiceoverCutPath: string;
  musicPath: string;
  outputPath: string;
  musicVolume?: number;
}): Promise<MusicMixResult> {
  const musicVolume = input.musicVolume ?? DEFAULT_MUSIC_VOLUME;

  if (!fs.existsSync(input.voiceoverCutPath)) {
    return {
      attempted: false,
      rendered: false,
      outputPath: null,
      musicVolume,
      reason: "Voiceover cut not available."
    };
  }

  if (!fs.existsSync(input.musicPath)) {
    return {
      attempted: false,
      rendered: false,
      outputPath: null,
      musicVolume,
      reason: "input/music.mp3 not found."
    };
  }

  const copyArgs = buildArgs(input, musicVolume, "copy");

  try {
    await execFileAsync("ffmpeg", copyArgs);

    return {
      attempted: true,
      rendered: true,
      outputPath: input.outputPath,
      musicVolume,
      ffmpegCommand: formatCommand(copyArgs)
    };
  } catch (copyError) {
    const fallbackArgs = buildArgs(input, musicVolume, "libx264");

    try {
      await execFileAsync("ffmpeg", fallbackArgs);

      return {
        attempted: true,
        rendered: true,
        outputPath: input.outputPath,
        musicVolume,
        ffmpegCommand: formatCommand(fallbackArgs)
      };
    } catch (fallbackError) {
      const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

      return {
        attempted: true,
        rendered: false,
        outputPath: input.outputPath,
        musicVolume,
        reason: message,
        ffmpegCommand: formatCommand(fallbackArgs)
      };
    }
  }
}

function buildArgs(
  input: { voiceoverCutPath: string; musicPath: string; outputPath: string },
  musicVolume: number,
  videoCodec: "copy" | "libx264"
): string[] {
  const args = [
    "-y",
    "-i",
    input.voiceoverCutPath,
    "-stream_loop",
    "-1",
    "-i",
    input.musicPath,
    "-filter_complex",
    `[1:a]volume=${musicVolume}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
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
