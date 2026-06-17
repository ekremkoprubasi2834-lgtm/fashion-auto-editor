import type { SceneAssetRequirement } from "./asset-requirements-builder.js";

export type AssetManifestEntry = {
  chapter: string;
  itemIndex: number | null;
  itemTitle: string | null;
  sceneIndex: number;
  layoutType: string;
  slot: string;
  purpose: string;
  searchKeywords: string[];
  suggestedAssetFolder: string;
  status: "missing" | "selected" | "rejected";
  localPath: string | null;
  sourceUrl: string | null;
  notes: string;
};

export function buildAssetManifest(requirements: SceneAssetRequirement[]): AssetManifestEntry[] {
  return requirements.flatMap((requirement) => {
    return requirement.slots.map((slot) => ({
      chapter: requirement.chapter,
      itemIndex: requirement.itemIndex,
      itemTitle: requirement.itemTitle,
      sceneIndex: requirement.sceneIndex,
      layoutType: requirement.layoutType,
      slot: slot.slot,
      purpose: slot.purpose,
      searchKeywords: slot.searchKeywords,
      suggestedAssetFolder: slot.suggestedAssetFolder,
      status: "missing" as const,
      localPath: null,
      sourceUrl: null,
      notes: ""
    }));
  });
}
