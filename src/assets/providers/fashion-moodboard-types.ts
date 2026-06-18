import type { SectionId } from "../asset-source-provider.js";

export type MoodboardProvider = "pinterest-browser";

export type MoodboardCandidateStatus =
  | "seen"
  | "downloaded"
  | "skipped-no-download"
  | "skipped-non-image"
  | "skipped-small-file"
  | "download-error";

export interface MoodboardSearchQuery {
  section: SectionId;
  query: string;
}

export interface MoodboardCandidate {
  provider: MoodboardProvider;
  section: SectionId;
  query: string;
  originalImageUrl: string;
  normalizedImageUrl: string;
  sourcePageUrl: string;
  downloadedPath: string | null;
  status: MoodboardCandidateStatus;
  bytes: number | null;
  contentType: string | null;
  createdAt: string;
}

export interface MoodboardCollectOptions {
  sections: SectionId[];
  limit: number;
  download: boolean;
}

export interface MoodboardCollectResult {
  generatedAt: string;
  runId: string;
  download: boolean;
  stagingRoot: string;
  candidates: MoodboardCandidate[];
}

export type MoodboardReviewDecision = "approve" | "review" | "reject";

export interface MoodboardReviewItem extends MoodboardCandidate {
  filename: string;
  absolutePath: string | null;
  width: number | null;
  height: number | null;
  contentHash: string | null;
  suggestedDecision: MoodboardReviewDecision;
  reasons: string[];
}

export interface MoodboardReviewManifest {
  generatedAt: string;
  runId: string;
  stagingRoot: string;
  reviewRoot: string;
  total: number;
  approve: number;
  review: number;
  reject: number;
  items: MoodboardReviewItem[];
}
