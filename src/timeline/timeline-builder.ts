import type { SceneSegment } from "../segmentation/segmenter.js";

export interface VisualTimelineItem {
  startTime: string;
  endTime: string;
  section: string;
  spokenText: string;
  visualIntent: string;
  suggestedAssetFolder: string;
  searchKeywords: string[];
}

export function buildVisualTimeline(segments: SceneSegment[]): VisualTimelineItem[] {
  return segments.map((segment) => {
    const visual = createFashionVisualIntent(segment.spokenText, segment.section);

    return {
      startTime: secondsToClock(segment.startSeconds),
      endTime: secondsToClock(segment.endSeconds),
      section: segment.section,
      spokenText: segment.spokenText,
      visualIntent: visual.intent,
      suggestedAssetFolder: visual.folder,
      searchKeywords: visual.keywords
    };
  });
}

function createFashionVisualIntent(text: string, section: string): {
  intent: string;
  folder: string;
  keywords: string[];
} {
  const normalized = text.toLocaleLowerCase("tr-TR");

  if (normalized.includes("aksesuar") || normalized.includes("çanta") || normalized.includes("kemer") || normalized.includes("fular")) {
    return {
      intent: "Close-up accessory styling shots: structured handbag, belt detail, earrings, silk scarf, clean neutral background.",
      folder: "assets/accessories",
      keywords: ["women fashion accessories", "structured handbag", "silk scarf styling", "minimal jewelry"]
    };
  }

  if (normalized.includes("ayakkabı") || normalized.includes("loafer") || normalized.includes("babet") || normalized.includes("topuklu")) {
    return {
      intent: "Footwear detail montage with outfit transitions: loafers, pointed flats, minimal heels, full-body mirror cutaways.",
      folder: "assets/shoes",
      keywords: ["women loafers outfit", "pointed flats fashion", "minimal heels outfit", "street style shoes"]
    };
  }

  if (normalized.includes("renk") || normalized.includes("krem") || normalized.includes("siyah") || normalized.includes("bordo")) {
    return {
      intent: "Color palette board with outfit flat lays in cream, black, gray, and burgundy; elegant wardrobe planning mood.",
      folder: "assets/color-palettes",
      keywords: ["neutral fashion palette", "burgundy outfit women", "cream black gray wardrobe", "capsule wardrobe colors"]
    };
  }

  if (normalized.includes("blazer") || normalized.includes("gömlek") || normalized.includes("pantolon")) {
    return {
      intent: "Polished capsule wardrobe sequence: white shirt, high-waist tailored trousers, blazer, office-to-evening styling.",
      folder: "assets/capsule-wardrobe",
      keywords: ["white shirt outfit women", "tailored trousers outfit", "women blazer styling", "office evening outfit"]
    };
  }

  if (normalized.includes("saten") || normalized.includes("etek") || normalized.includes("triko")) {
    return {
      intent: "Soft feminine styling b-roll: satin skirt movement, fine knit texture, elegant minimal outfit details.",
      folder: "assets/feminine-style",
      keywords: ["satin skirt outfit", "fine knit sweater women", "feminine minimal style", "elegant skirt outfit"]
    };
  }

  return {
    intent: section === "hook"
      ? "Fast opening montage of refined women's outfits, wardrobe rail, mirror pose, and clean editorial detail shots."
      : "Editorial women fashion b-roll matching the spoken styling advice with clean cuts and close-up texture details.",
    folder: "assets/general-fashion",
    keywords: ["women fashion styling", "minimal chic outfit", "capsule wardrobe women", "editorial fashion b roll"]
  };
}

function secondsToClock(seconds: number): string {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
