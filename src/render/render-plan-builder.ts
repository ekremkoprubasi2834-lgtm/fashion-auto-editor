import type { AssetManifestEntry } from "../assets/asset-manifest-builder.js";
import type { MotionPlan, SceneType, TitleCard, VisualTimelineItem } from "../timeline/timeline-builder.js";

export type RenderPlanAsset = {
  slot: string;
  status: "missing" | "selected" | "rejected";
  localPath: string | null;
  purpose: string;
};

export type SceneRenderPlan = {
  globalSceneIndex: number;
  type: SceneType;
  chapter: string;
  itemIndex: number | null;
  itemTitle: string | null;
  sceneIndex: number;
  section: string;
  layoutType: string;
  motion: MotionPlan;
  startTime: string;
  endTime: string;
  spokenText: string;
  titleCard: TitleCard | null;
  requiredAssetCount: number;
  selectedAssetCount: number;
  missingSlots: string[];
  readyToRender: boolean;
  assets: RenderPlanAsset[];
};

export type VideoRenderPlan = {
  video: {
    width: 1920;
    height: 1080;
    aspectRatio: "16:9";
    format: "youtube_horizontal";
  };
  summary: {
    totalScenes: number;
    readyScenes: number;
    blockedScenes: number;
    totalRequiredAssets: number;
    totalSelectedAssets: number;
    totalMissingAssets: number;
    readyToRender: boolean;
  };
  scenes: SceneRenderPlan[];
};

export function buildRenderPlan(input: {
  timelineItems: VisualTimelineItem[];
  manifest: AssetManifestEntry[];
}): VideoRenderPlan {
  const scenes = input.timelineItems.map((item) => buildSceneRenderPlan(item, input.manifest));
  const readyScenes = scenes.filter((scene) => scene.readyToRender).length;
  const totalRequiredAssets = scenes.reduce((total, scene) => total + scene.requiredAssetCount, 0);
  const totalSelectedAssets = scenes.reduce((total, scene) => total + scene.selectedAssetCount, 0);

  return {
    video: {
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
      format: "youtube_horizontal"
    },
    summary: {
      totalScenes: scenes.length,
      readyScenes,
      blockedScenes: scenes.length - readyScenes,
      totalRequiredAssets,
      totalSelectedAssets,
      totalMissingAssets: totalRequiredAssets - totalSelectedAssets,
      readyToRender: readyScenes === scenes.length
    },
    scenes
  };
}

function buildSceneRenderPlan(item: VisualTimelineItem, manifest: AssetManifestEntry[]): SceneRenderPlan {
  const assets = findSceneAssets(item, manifest);
  const selectedAssetCount = assets.filter((asset) => asset.status === "selected").length;
  const missingSlots = assets
    .filter((asset) => asset.status === "missing")
    .map((asset) => asset.slot);
  const requiredAssetCount = assets.length;

  return {
    globalSceneIndex: item.globalSceneIndex,
    type: item.sceneType,
    chapter: item.chapter,
    itemIndex: item.itemIndex,
    itemTitle: item.itemTitle,
    sceneIndex: item.sceneIndex,
    section: item.section,
    layoutType: item.layoutType,
    motion: item.motion,
    startTime: item.startTime,
    endTime: item.endTime,
    spokenText: item.spokenText,
    titleCard: item.titleCard ?? null,
    requiredAssetCount,
    selectedAssetCount,
    missingSlots,
    readyToRender: selectedAssetCount >= requiredAssetCount,
    assets
  };
}

function findSceneAssets(item: VisualTimelineItem, manifest: AssetManifestEntry[]): RenderPlanAsset[] {
  return manifest
    .filter((entry) => entry.globalSceneIndex === item.globalSceneIndex)
    .map((entry) => ({
      slot: entry.slot,
      status: entry.status,
      localPath: entry.localPath,
      purpose: entry.purpose
    }));
}
