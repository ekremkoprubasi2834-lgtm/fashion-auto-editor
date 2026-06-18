import fs from "node:fs";
import path from "node:path";
import type { SectionId } from "../asset-source-provider.js";
import { buildVisionRubric, type VisionScore } from "./fashion-vision-rubric.js";

export interface VisionClientOptions {
  apiKey: string;
  model: string;
}

interface ResponsesPayload {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

export class FashionVisionClient {
  constructor(private readonly options: VisionClientOptions) {}

  async scoreImage(input: { section: SectionId; fileName: string; imagePath: string }): Promise<VisionScore> {
    const imageUrl = buildDataUrl(input.imagePath);
    const prompt = [
      buildVisionRubric(input.section),
      "",
      `Score this image for section "${input.section}".`,
      `File name: ${input.fileName}`,
      "Return JSON only."
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: imageUrl, detail: "low" }
            ]
          }
        ],
        max_output_tokens: 700
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI vision scoring failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as ResponsesPayload;
    return normalizeScore(parseScore(extractText(payload)), input.section, input.fileName);
  }
}

function buildDataUrl(imagePath: string): string {
  const buffer = fs.readFileSync(imagePath);
  const mime = mimeFromExtension(path.extname(imagePath).toLowerCase());
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function mimeFromExtension(extension: string): string {
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".gif") {
    return "image/gif";
  }
  return "image/jpeg";
}

function extractText(payload: ResponsesPayload): string {
  if (payload.output_text?.trim()) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  for (const output of payload.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.text) {
        parts.push(content.text);
      }
    }
  }
  const text = parts.join("\n").trim();
  if (!text) {
    throw new Error("OpenAI vision scoring response did not include text.");
  }
  return text;
}

function parseScore(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`Vision response was not valid JSON: ${text.slice(0, 200)}`);
    }
    return JSON.parse(match[0]);
  }
}

function normalizeScore(value: unknown, section: SectionId, fileName: string): VisionScore {
  const object = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const decision = normalizeDecision(object.decision);

  return {
    section,
    fileName,
    decision,
    overallScore: clampScore(object.overallScore),
    sectionMatchScore: clampScore(object.sectionMatchScore),
    premiumScore: clampScore(object.premiumScore),
    ageFitScore: clampScore(object.ageFitScore),
    textOverlay: Boolean(object.textOverlay),
    watermark: Boolean(object.watermark),
    garmentVisible: Boolean(object.garmentVisible),
    reasons: Array.isArray(object.reasons) ? object.reasons.map(String).slice(0, 6) : ["No reasons returned."],
    notes: typeof object.notes === "string" ? object.notes.slice(0, 240) : ""
  };
}

function normalizeDecision(value: unknown): VisionScore["decision"] {
  return value === "approve" || value === "reject" || value === "review" ? value : "review";
}

function clampScore(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}
