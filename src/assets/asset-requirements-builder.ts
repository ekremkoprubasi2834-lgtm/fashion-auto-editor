import type { VisualLayoutType } from "../layout/visual-layout-engine.js";
import type { VisualTimelineItem } from "../timeline/timeline-builder.js";

export type AssetSlot = {
  slot: string;
  purpose: string;
  searchKeywords: string[];
  suggestedAssetFolder: string;
};

export type SceneAssetRequirement = {
  globalSceneIndex: number;
  chapter: string;
  itemIndex: number | null;
  itemTitle: string | null;
  sceneIndex: number;
  layoutType: string;
  requiredAssetCount: number;
  slots: AssetSlot[];
};

type SlotDefinition = {
  slot: string;
  purpose: string;
  extraKeywords?: string[];
};

const SLOT_DEFINITIONS: Record<VisualLayoutType, SlotDefinition[]> = {
  single_focus: [
    {
      slot: "primary",
      purpose: "Single exact outfit visual matching the spoken clothing items and colors."
    }
  ],
  sequence_single: [
    {
      slot: "primary",
      purpose: "Single strong outfit visual for a moving sequence within this scene."
    }
  ],
  detail_focus: [
    {
      slot: "primary",
      purpose: "Close or medium detail visual matching the spoken styling detail."
    }
  ],
  moodboard_2: [
    {
      slot: "left",
      purpose: "First matching outfit variation."
    },
    {
      slot: "right",
      purpose: "Second matching outfit variation."
    }
  ],
  moodboard_3: [
    {
      slot: "left",
      purpose: "First outfit/reference visual."
    },
    {
      slot: "center",
      purpose: "Detail, color palette, fabric, or key item close-up.",
      extraKeywords: ["detail", "fabric", "color palette", "close up"]
    },
    {
      slot: "right",
      purpose: "Second outfit/reference visual."
    }
  ],
  comparison_2: [
    {
      slot: "before",
      purpose: "Outdated, casual, wrong, or less polished reference.",
      extraKeywords: ["outdated", "casual", "wrong styling", "billig wirkend"]
    },
    {
      slot: "after",
      purpose: "Better, elegant, modern, or more polished alternative.",
      extraKeywords: ["elegant", "hochwertig", "polished", "modern styling"]
    }
  ],
  recap_grid: [
    {
      slot: "top_left",
      purpose: "Recap visual for the chapter or item."
    },
    {
      slot: "top_right",
      purpose: "Recap visual for the chapter or item."
    },
    {
      slot: "bottom_left",
      purpose: "Recap visual for the chapter or item."
    },
    {
      slot: "bottom_right",
      purpose: "Recap visual for the chapter or item."
    }
  ]
};

export function buildAssetRequirements(timelineItems: VisualTimelineItem[]): SceneAssetRequirement[] {
  return timelineItems.map((item) => {
    const definitions = SLOT_DEFINITIONS[item.layoutType];

    return {
      globalSceneIndex: item.globalSceneIndex,
      chapter: item.chapter,
      itemIndex: item.itemIndex,
      itemTitle: item.itemTitle,
      sceneIndex: item.sceneIndex,
      layoutType: item.layoutType,
      requiredAssetCount: definitions.length,
      slots: definitions.map((definition) => buildSlot(definition, item))
    };
  });
}

function buildSlot(definition: SlotDefinition, item: VisualTimelineItem): AssetSlot {
  return {
    slot: definition.slot,
    purpose: definition.purpose,
    searchKeywords: dedupe([...item.searchKeywords, ...(definition.extraKeywords ?? [])]),
    suggestedAssetFolder: item.suggestedAssetFolder
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
