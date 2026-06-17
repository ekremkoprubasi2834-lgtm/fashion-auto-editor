import type { AssetManifestEntry } from "../assets/asset-manifest-builder.js";

export function exportAssetManifest(manifest: AssetManifestEntry[]): string {
  return JSON.stringify(manifest, null, 2) + "\n";
}
