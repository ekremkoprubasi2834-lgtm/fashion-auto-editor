import type { SceneAssetRequirement } from "../assets/asset-requirements-builder.js";

export function exportAssetRequirements(requirements: SceneAssetRequirement[]): string {
  return JSON.stringify(requirements, null, 2) + "\n";
}
