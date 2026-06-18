import crypto from "node:crypto";
import path from "node:path";

export function isPinterestImageUrl(url: string): boolean {
  return (
    url.includes("pinimg.com") &&
    !url.includes("/avatars/") &&
    !url.includes("/user_images/") &&
    !url.includes("/75x75/")
  );
}

export function normalizePinimgUrl(url: string): string {
  return url.replace(/pinimg\.com\/[^/]+\//, "pinimg.com/736x/");
}

export function pinimgDedupeKey(url: string): string {
  const match = url.match(/pinimg\.com\/[^/]+\/(.+)/);
  return match ? match[1] : url;
}

export function shortUrlHash(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 12);
}

export function extensionFromContentType(contentType: string | null): string {
  const normalized = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (normalized === "image/png") {
    return ".png";
  }
  if (normalized === "image/webp") {
    return ".webp";
  }
  if (normalized === "image/gif") {
    return ".gif";
  }
  return ".jpg";
}

export function safeImageExtension(url: string, contentType: string | null): string {
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)) {
      return extension === ".jpeg" ? ".jpg" : extension;
    }
  } catch {
    // fall through to content type
  }
  return extensionFromContentType(contentType);
}
