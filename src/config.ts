import fs from "node:fs";
import path from "node:path";

export interface AppConfig {
  inputTranscriptPath: string;
  inputVoiceoverPath: string;
  inputMusicPath: string;
  outputDir: string;
  openaiApiKey?: string;
  transcriptionProvider: "openai" | "dev";
  transcriptionModel: string;
  transcriptCachePath: string;
  enableSubtitleBurn: boolean;
}

loadDotEnvIfPresent();

export const config: AppConfig = {
  inputTranscriptPath: process.env.INPUT_TRANSCRIPT_PATH ?? path.join("input", "transcript.txt"),
  inputVoiceoverPath: process.env.INPUT_VOICEOVER_PATH ?? path.join("input", "voiceover.mp3"),
  inputMusicPath: process.env.INPUT_MUSIC_PATH ?? path.join("input", "music.mp3"),
  outputDir: process.env.OUTPUT_DIR ?? "output",
  openaiApiKey: process.env.OPENAI_API_KEY,
  transcriptionProvider: process.env.TRANSCRIPTION_PROVIDER === "dev" ? "dev" : "openai",
  transcriptionModel: process.env.TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe",
  transcriptCachePath: process.env.TRANSCRIPT_CACHE_PATH ?? path.join(".cache", "transcript.json"),
  enableSubtitleBurn: process.env.ENABLE_SUBTITLE_BURN === "true"
};

function loadDotEnvIfPresent(envPath = ".env"): void {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = stripOptionalQuotes(rawValue);
  }
}

function stripOptionalQuotes(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}
