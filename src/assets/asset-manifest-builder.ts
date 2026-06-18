import type { SceneAssetRequirement } from "./asset-requirements-builder.js";

export type AssetManifestEntry = {
  globalSceneIndex: number;
  chapter: string;
  itemIndex: number | null;
  itemTitle: string | null;
  sceneIndex: number;
  section: string;
  layoutType: string;
  slot: string;
  purpose: string;
  searchKeywords: string[];
  suggestedAssetFolder: string;
  manualFilename: string;
  status: "missing" | "selected" | "rejected";
  localPath: string | null;
  sourceUrl: string | null;
  notes: string;
};

export function buildAssetManifest(requirements: SceneAssetRequirement[]): AssetManifestEntry[] {
  return requirements.flatMap((requirement) => {
    return requirement.slots.map((slot) => ({
      globalSceneIndex: requirement.globalSceneIndex,
      chapter: requirement.chapter,
      itemIndex: requirement.itemIndex,
      itemTitle: requirement.itemTitle,
      sceneIndex: requirement.sceneIndex,
      section: requirement.section,
      layoutType: requirement.layoutType,
      slot: slot.slot,
      purpose: slot.purpose,
      searchKeywords: slot.searchKeywords,
      suggestedAssetFolder: slot.suggestedAssetFolder,
      manualFilename: `assets/scene-${requirement.globalSceneIndex}-${slot.slot}.jpg`,
      status: "missing" as const,
      localPath: null,
      sourceUrl: null,
      notes: ""
    }));
  });
}
