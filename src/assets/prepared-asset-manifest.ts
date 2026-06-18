import fs from "node:fs";
import path from "node:path";
import { COLLECTABLE_SECTIONS, type SectionId } from "./asset-source-provider.js";

export const PREPARED_ASSET_MANIFEST_PATH = path.join("output", "prepared_asset_manifest.json");

export interface PreparedAssetManifestEntry {
  section: SectionId;
  displayTitle: string;
  filename: string;
  path: string;
  sourcePath: string;
  contentHash: string | null;
  bytes: number | null;
}

export interface PreparedAssetManifest {
  generatedAt: string;
  assetsDir: string;
  sourceBaseDir: string;
  total: number;
  sections: Record<SectionId, { minimum: number; count: number; files: PreparedAssetManifestEntry[] }>;
}

export type PreparedAssetManifestLoadResult =
  | { ok: true; manifest: PreparedAssetManifest }
  | { ok: false; code: "PREPARED_ASSET_MANIFEST_MISSING" | "PREPARED_ASSET_MANIFEST_INVALID"; reason: string };

export function loadPreparedAssetManifest(
  manifestPath = PREPARED_ASSET_MANIFEST_PATH
): PreparedAssetManifestLoadResult {
  if (!fs.existsSync(manifestPath)) {
    return {
      ok: false,
      code: "PREPARED_ASSET_MANIFEST_MISSING",
      reason: `Prepared asset manifest not found at ${manifestPath}. Run npm run assets:prepare.`
    };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PreparedAssetManifest;
    for (const definition of COLLECTABLE_SECTIONS) {
      const section = manifest.sections?.[definition.id];
      if (!section) {
        return {
          ok: false,
          code: "PREPARED_ASSET_MANIFEST_INVALID",
          reason: `Prepared asset manifest is missing section ${definition.id}.`
        };
      }
      for (const file of section.files) {
        if (!file.path || !fs.existsSync(file.path)) {
          return {
            ok: false,
            code: "PREPARED_ASSET_MANIFEST_INVALID",
            reason: `Prepared asset file missing for ${definition.id}: ${file.path}`
          };
        }
      }
    }
    return { ok: true, manifest };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: "PREPARED_ASSET_MANIFEST_INVALID",
      reason: `Prepared asset manifest could not be read: ${reason}`
    };
  }
}

export function isPreparedManifestSufficient(manifest: PreparedAssetManifest): boolean {
  return COLLECTABLE_SECTIONS.every((definition) => {
    const section = manifest.sections[definition.id];
    return section && section.count >= definition.minimum;
  });
}

export function preparedManifestCounts(manifest: PreparedAssetManifest): Record<SectionId, number> {
  return Object.fromEntries(
    COLLECTABLE_SECTIONS.map((definition) => [definition.id, manifest.sections[definition.id]?.count ?? 0])
  ) as Record<SectionId, number>;
}
