// Pinterest OAuth 2.0 (Authorization Code) helpers.
//
// Official flow only — no passwords, cookies, or scraping. The MVP runs the
// exchange manually: `pinterest:auth` prints an authorize URL, the user
// approves in a browser, copies the `code` from the redirect, and exchanges it
// for tokens. Real tokens are never printed by these functions.

import crypto from "node:crypto";
import {
  PINTEREST_SCOPES,
  type PinterestEnvConfig,
  type PinterestScope
} from "./pinterest-types.js";

const PINTEREST_AUTHORIZE_ENDPOINT = "https://www.pinterest.com/oauth/";

export interface PinterestTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
}

export interface AuthorizeUrlResult {
  url: string;
  state: string;
}

// Builds the consent URL the user opens in a browser. Generates a random state
// for CSRF protection unless the caller pins one. Requires app id + redirect
// uri; secret is NOT needed here.
export function buildAuthorizeUrl(
  config: PinterestEnvConfig,
  scopes: readonly PinterestScope[] = PINTEREST_SCOPES,
  state: string = crypto.randomBytes(16).toString("hex")
): AuthorizeUrlResult {
  if (!config.appId) {
    throw new Error("Pinterest app id missing. Set PINTEREST_APP_ID in .env (see .env.example).");
  }
  if (!config.redirectUri) {
    throw new Error("Pinterest redirect uri missing. Set PINTEREST_REDIRECT_URI in .env.");
  }

  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: scopes.join(","),
    state
  });

  return { url: `${PINTEREST_AUTHORIZE_ENDPOINT}?${params.toString()}`, state };
}

// Exchanges an authorization code for access + refresh tokens. Uses HTTP Basic
// auth with the app id/secret per Pinterest's spec. Throws a clear, token-free
// error on any non-2xx response.
export async function exchangeCodeForToken(
  config: PinterestEnvConfig,
  code: string
): Promise<PinterestTokenResponse> {
  requireClientCredentials(config);
  if (!code) {
    throw new Error("Authorization code missing. Pass the `code` from the redirect URL.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri
  });

  return postToken(config, body, "code exchange");
}

// Trades the stored refresh token for a fresh access token.
export async function refreshAccessToken(config: PinterestEnvConfig): Promise<PinterestTokenResponse> {
  requireClientCredentials(config);
  if (!config.refreshToken) {
    throw new Error("Refresh token missing. Set PINTEREST_REFRESH_TOKEN or re-run pinterest:auth.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refreshToken
  });

  return postToken(config, body, "token refresh");
}

function requireClientCredentials(config: PinterestEnvConfig): void {
  if (!config.appId || !config.appSecret) {
    throw new Error(
      "Pinterest app credentials missing. Set PINTEREST_APP_ID and PINTEREST_APP_SECRET in .env."
    );
  }
}

async function postToken(
  config: PinterestEnvConfig,
  body: URLSearchParams,
  context: string
): Promise<PinterestTokenResponse> {
  const basic = Buffer.from(`${config.appId}:${config.appSecret}`).toString("base64");
  const endpoint = `${config.apiBaseUrl}/oauth/token`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Pinterest ${context} request failed: ${reason}`);
  }

  if (!response.ok) {
    // Surface status + any provider error message, but never echo our credentials.
    const detail = await safeReadErrorDetail(response);
    throw new Error(`Pinterest ${context} failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}.`);
  }

  return (await response.json()) as PinterestTokenResponse;
}

async function safeReadErrorDetail(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    if (!text) {
      return null;
    }
    try {
      const parsed = JSON.parse(text) as { message?: string; error_description?: string; error?: string };
      return parsed.message ?? parsed.error_description ?? parsed.error ?? text.slice(0, 200);
    } catch {
      return text.slice(0, 200);
    }
  } catch {
    return null;
  }
}
