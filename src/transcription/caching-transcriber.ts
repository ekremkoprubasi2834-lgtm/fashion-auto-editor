import fs from "node:fs";
import path from "node:path";
import type { TranscriptResult, Transcriber } from "./transcriber.js";

interface CacheKey {
  audioPath: string;
  audioSize: number;
  audioMtimeMs: number;
  model: string;
}

interface CacheFile extends CacheKey {
  transcript: TranscriptResult;
}

// Wraps a transcriber so a given audio file is transcribed once and reused on
// later runs. OpenAI speech-to-text is non-deterministic, so re-transcribing
// the same audio yields slightly different text and shifts scene segmentation
// (e.g. 13 vs 14 scenes). Caching pins the transcript, which keeps scene count,
// globalSceneIndex, asset manifest and render plan stable across runs.
export class CachingTranscriber implements Transcriber {
  constructor(
    private readonly inner: Transcriber,
    private readonly audioPath: string,
    private readonly model: string,
    private readonly cachePath: string
  ) {}

  async transcribe(): Promise<TranscriptResult> {
    const key = this.currentKey();
    const cached = key ? this.readCache(key) : null;

    if (cached) {
      return cached;
    }

    const result = await this.inner.transcribe();

    if (key) {
      this.writeCache(key, result);
    }

    return result;
  }

  private currentKey(): CacheKey | null {
    try {
      const stats = fs.statSync(this.audioPath);

      return {
        audioPath: this.audioPath,
        audioSize: stats.size,
        audioMtimeMs: stats.mtimeMs,
        model: this.model
      };
    } catch {
      return null;
    }
  }

  private readCache(key: CacheKey): TranscriptResult | null {
    if (!fs.existsSync(this.cachePath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.cachePath, "utf8")) as CacheFile;

      if (
        parsed.audioPath === key.audioPath &&
        parsed.audioSize === key.audioSize &&
        parsed.audioMtimeMs === key.audioMtimeMs &&
        parsed.model === key.model &&
        typeof parsed.transcript?.text === "string"
      ) {
        return parsed.transcript;
      }
    } catch {
      return null;
    }

    return null;
  }

  private writeCache(key: CacheKey, transcript: TranscriptResult): void {
    const payload: CacheFile = { ...key, transcript };

    fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
    fs.writeFileSync(this.cachePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  }
}
