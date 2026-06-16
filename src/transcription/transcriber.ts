export interface SpeechSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface TranscriptResult {
  text: string;
  source: string;
  provider: "dev" | "openai";
  speechSegments: SpeechSegment[];
}

export interface Transcriber {
  transcribe(): Promise<TranscriptResult>;
}
