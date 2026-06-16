import fs from "node:fs/promises";
import path from "node:path";
import type { SpeechSegment, TranscriptResult, Transcriber } from "./transcriber.js";

interface OpenAITranscriptionResponse {
  text?: string;
  segments?: Array<{
    start?: number;
    end?: number;
    text?: string;
  }>;
}

export class OpenAITranscriber implements Transcriber {
  constructor(
    private readonly audioPath: string,
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async transcribe(): Promise<TranscriptResult> {
    const formData = new FormData();
    const audioBuffer = await fs.readFile(this.audioPath);
    const audioFile = new Blob([audioBuffer], { type: "audio/mpeg" });

    formData.append("file", audioFile, path.basename(this.audioPath));
    formData.append("model", this.model);
    formData.append("response_format", "json");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`OpenAI transcription failed (${response.status}): ${await response.text()}`);
    }

    const payload = await response.json() as OpenAITranscriptionResponse;
    const text = payload.text?.trim();

    if (!text) {
      throw new Error("OpenAI transcription response did not include transcript text.");
    }

    return {
      text,
      source: this.audioPath,
      provider: "openai",
      speechSegments: toSpeechSegments(payload.segments)
    };
  }
}

function toSpeechSegments(segments: OpenAITranscriptionResponse["segments"]): SpeechSegment[] {
  if (!segments) {
    return [];
  }

  return segments
    .filter((segment) => typeof segment.start === "number" && typeof segment.end === "number" && Boolean(segment.text?.trim()))
    .map((segment) => ({
      startSeconds: segment.start as number,
      endSeconds: segment.end as number,
      text: (segment.text as string).trim()
    }));
}
