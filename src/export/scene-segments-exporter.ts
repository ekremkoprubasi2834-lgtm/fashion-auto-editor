import type { ChapterSegment, SceneSegment, SegmentationResult } from "../segmentation/segmenter.js";
import type { VisualTimelineItem } from "../timeline/timeline-builder.js";

interface ExportedScene {
  id: number;
  chapter: SceneSegment["chapter"];
  itemIndex: number | null;
  itemTitle: string | null;
  sceneIndex: number;
  startTime: string;
  endTime: string;
  spokenText: string;
  layoutType: VisualTimelineItem["layoutType"];
  visualIntent: string;
  suggestedAssetFolder: string;
  searchKeywords: string[];
}

interface ExportedItem {
  itemIndex: number;
  itemTitle: string;
  scenes: ExportedScene[];
}

interface ExportedChapter {
  chapter: ChapterSegment["chapter"];
  scenes?: ExportedScene[];
  items?: ExportedItem[];
}

interface ExportedSceneSegments {
  qualityWarnings: string[];
  chapters: ExportedChapter[];
}

export function exportSceneSegments(segmentation: SegmentationResult, timeline: VisualTimelineItem[]): ExportedSceneSegments {
  return {
    qualityWarnings: segmentation.qualityWarnings,
    chapters: segmentation.chapters.map((chapter) => {
      if (chapter.items) {
        return {
          chapter: chapter.chapter,
          items: chapter.items.map((item) => ({
            itemIndex: item.itemIndex,
            itemTitle: item.itemTitle,
            scenes: item.scenes.map((scene) => enrichScene(scene, timeline))
          }))
        };
      }

      return {
        chapter: chapter.chapter,
        scenes: (chapter.scenes ?? []).map((scene) => enrichScene(scene, timeline))
      };
    })
  };
}

function enrichScene(scene: SceneSegment, timeline: VisualTimelineItem[]): ExportedScene {
  const timelineItem = timeline[scene.id - 1];

  if (!timelineItem) {
    throw new Error(`Missing visual timeline item for scene ${scene.id}.`);
  }

  return {
    id: scene.id,
    chapter: scene.chapter,
    itemIndex: scene.itemIndex,
    itemTitle: scene.itemTitle,
    sceneIndex: scene.sceneIndex,
    startTime: timelineItem.startTime,
    endTime: timelineItem.endTime,
    spokenText: scene.spokenText,
    layoutType: timelineItem.layoutType,
    visualIntent: timelineItem.visualIntent,
    suggestedAssetFolder: timelineItem.suggestedAssetFolder,
    searchKeywords: timelineItem.searchKeywords
  };
}
