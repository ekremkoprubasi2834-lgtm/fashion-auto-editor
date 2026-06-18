// Pinterest connector — typed models and environment reader.
//
// Holds the env-config shape, the subset of the Pinterest v5 REST payloads we
// consume (boards + pins), and our normalized pin shape. Nothing here performs
// I/O. Tokens are never logged; use maskToken() whenever a token-derived value
// must appear in human-readable output.

import type { MediaType, SectionId } from "../asset-source-provider.js";

export const PINTEREST_DEFAULT_API_BASE_URL = "https://api.pinterest.com/v5";
export const PINTEREST_DEFAULT_REDIRECT_URI = "http://localhost:8787/pinterest/callback";

// Scopes the MVP requests. user_accounts:read is optional but harmless.
export const PINTEREST_SCOPES = ["boards:read", "pins:read", "user_accounts:read"] as const;
export type PinterestScope = (typeof PINTEREST_SCOPES)[number];

export interface PinterestEnvConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
  apiBaseUrl: string;
}

// Reads connector configuration from the environment. config.ts has already
// loaded .env by the time any CLI command runs, so this only touches
// process.env. Missing values come back as empty strings (never undefined) so
// callers can give a single, clear "token missing" message.
export function readPinterestEnv(env: NodeJS.ProcessEnv = process.env): PinterestEnvConfig {
  return {
    appId: (env.PINTEREST_APP_ID ?? "").trim(),
    appSecret: (env.PINTEREST_APP_SECRET ?? "").trim(),
    redirectUri: (env.PINTEREST_REDIRECT_URI ?? "").trim() || PINTEREST_DEFAULT_REDIRECT_URI,
    accessToken: (env.PINTEREST_ACCESS_TOKEN ?? "").trim(),
    refreshToken: (env.PINTEREST_REFRESH_TOKEN ?? "").trim(),
    apiBaseUrl: ((env.PINTEREST_API_BASE_URL ?? "").trim() || PINTEREST_DEFAULT_API_BASE_URL).replace(/\/+$/, "")
  };
}

// Never reveal a secret in logs/reports. Shows length + a 4-char tail so the
// user can tell two tokens apart without exposing either.
export function maskToken(token: string): string {
  if (!token) {
    return "(none)";
  }
  if (token.length <= 6) {
    return `set (${token.length} chars)`;
  }
  return `set (${token.length} chars, …${token.slice(-4)})`;
}

// ---- raw Pinterest v5 payload subsets (only the fields we read) ----

export interface PinterestPagedResponse<T> {
  items?: T[];
  bookmark?: string | null;
}

export interface PinterestBoard {
  id: string;
  name: string;
  description?: string | null;
}

export interface PinterestImageVariant {
  width?: number;
  height?: number;
  url?: string;
}

export interface PinterestMedia {
  media_type?: string;
  images?: Record<string, PinterestImageVariant>;
  // Video pins expose cover images under `images` plus a video manifest here.
  video_url?: string;
  url?: string;
}

export interface PinterestPin {
  id: string;
  board_id?: string;
  title?: string | null;
  description?: string | null;
  alt_text?: string | null;
  link?: string | null;
  media?: PinterestMedia;
}

// ---- normalized shape the collector/report layer consumes ----

export interface NormalizedPin {
  provider: "pinterest";
  pinId: string;
  boardId: string;
  section: SectionId;
  title: string;
  description: string;
  link: string | null;
  mediaType: MediaType;
  imageUrl: string | null;
  videoUrl: string | null;
  sourceUrl: string | null;
  width: number | null;
  height: number | null;
}
