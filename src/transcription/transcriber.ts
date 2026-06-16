export interface TranscriptResult {
  text: string;
  source: string;
}

export interface Transcriber {
  transcribe(): Promise<TranscriptResult>;
}
