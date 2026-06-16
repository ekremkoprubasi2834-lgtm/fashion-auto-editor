import { readTextFile } from "../utils/fs.js";
import type { TranscriptResult, Transcriber } from "./transcriber.js";

export class DevTranscriptTranscriber implements Transcriber {
  constructor(private readonly transcriptPath: string) {}

  async transcribe(): Promise<TranscriptResult> {
    const text = (await readTextFile(this.transcriptPath)).trim();

    if (!text) {
      throw new Error(`Input transcript at "${this.transcriptPath}" is empty. Add transcript text and run the CLI again.`);
    }

    return {
      text,
      source: this.transcriptPath
    };
  }
}
