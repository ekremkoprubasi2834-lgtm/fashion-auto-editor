import fs from "node:fs";
import path from "node:path";
import type { AssetManifestEntry } from "./asset-manifest-builder.js";

const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export function resolveManualAssets(manifest: AssetManifestEntry[], assetsDir: string): AssetManifestEntry[] {
  if (!fs.existsSync(assetsDir)) {
    return manifest.map((entry) => ({ ...entry }));
  }

  return manifest.map((entry) => {
    const localPath = findManualAssetPath(entry, assetsDir);

    if (!localPath) {
      return {
        ...entry,
        status: "missing",
        localPath: null
      };
    }

    return {
      ...entry,
      status: "selected",
      localPath,
      sourceUrl: null,
      notes: "Selected from manual assets folder."
    };
  });
}

function findManualAssetPath(entry: AssetManifestEntry, assetsDir: string): string | null {
  for (const slot of fallbackSlotsFor(entry.slot)) {
    for (const extension of SUPPORTED_EXTENSIONS) {
      const candidate = path.join(assetsDir, `scene-${entry.globalSceneIndex}-${slot}${extension}`);

      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function fallbackSlotsFor(slot: string): string[] {
  if (slot === "primary") {
    return ["primary", "center", "left", "before", "after", "top_left"];
  }

  if (slot === "left") {
    return ["left", "before", "top_left"];
  }

  if (slot === "right") {
    return ["right", "after", "top_right"];
  }

  if (slot === "center") {
    return ["center", "after", "before", "left"];
  }

  return [slot];
}
