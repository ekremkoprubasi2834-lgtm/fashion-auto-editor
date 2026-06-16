import path from "node:path";

export interface AppConfig {
  inputTranscriptPath: string;
  outputDir: string;
}

export const config: AppConfig = {
  inputTranscriptPath: process.env.INPUT_TRANSCRIPT_PATH ?? path.join("input", "transcript.txt"),
  outputDir: process.env.OUTPUT_DIR ?? "output"
};
