import type { SectionId } from "../asset-source-provider.js";

export type VisionDecision = "approve" | "review" | "reject";

export interface VisionScore {
  section: SectionId;
  fileName: string;
  decision: VisionDecision;
  overallScore: number;
  sectionMatchScore: number;
  premiumScore: number;
  ageFitScore: number;
  textOverlay: boolean;
  watermark: boolean;
  garmentVisible: boolean;
  reasons: string[];
  notes: string;
}

export function buildVisionRubric(section: SectionId): string {
  const shared = [
    "Score for a women's fashion YouTube channel aimed at a polished 35-55 audience.",
    "Prefer premium, elegant, neutral, wearable, quiet-luxury styling.",
    "Penalize heavy text overlay, visible watermark, teen styling, clubwear, extreme editorial styling, and non-fashion/product-only images.",
    "Reject if the required garment/category is not clearly visible.",
    "Use approve only when the image is clearly usable as a premium fashion asset.",
    "Use review when the image may be usable but has ambiguity, minor overlay, uncertain garment match, or uncertain audience fit.",
    "Use reject for wrong garment/category, watermark-heavy/text-heavy image, poor fit, or obviously unusable styling."
  ];

  return [...shared, sectionRule(section), outputRule()].join("\n");
}

function sectionRule(section: SectionId): string {
  switch (section) {
    case "westen":
      return [
        "Section: westen.",
        "Must show a sleeveless vest, waistcoat, or sleeveless blazer clearly.",
        "Reject if no vest is visible or if it is only a generic top/dress.",
        "High score for neutral, elegant, structured outfits and 35-55 compatible premium styling."
      ].join("\n");
    case "blusen":
      return [
        "Section: blusen.",
        "Must show a blouse or shirt-blouse clearly.",
        "Reject plain t-shirt, hoodie, sweatshirt.",
        "High score for white, cream, light blue, linen, silk, or crisp cotton blouse styling."
      ].join("\n");
    case "weisse_hosen":
      return [
        "Section: weisse_hosen.",
        "Must show white trousers or white wide-leg pants clearly.",
        "Reject shorts. Reject jeans unless they clearly read as elegant white trousers.",
        "High score for elegant white trousers paired with blouse, top, or vest."
      ].join("\n");
    case "rocke":
      return [
        "Section: rocke.",
        "Must show a midi or maxi skirt clearly.",
        "Reject mini skirt.",
        "High score for satin, flowing, elegant summer skirt styling."
      ].join("\n");
    case "tops":
      return [
        "Section: tops.",
        "Must show a high-quality top: satin, silk, viscose, elegant sleeveless top, or refined top.",
        "Reject basic t-shirt and sporty tank.",
        "High score for elegant premium top styling."
      ].join("\n");
    case "intro":
      return [
        "Section: intro.",
        "Must show an elegant summer outfit, quiet luxury look, or polished styling.",
        "Reject random beauty portrait, product-only image, or non-outfit image."
      ].join("\n");
    default:
      return "Section: unknown. Use review unless the image is clearly applicable.";
  }
}

function outputRule(): string {
  return [
    "Return only valid JSON with this exact shape:",
    "{",
    "\"section\":\"westen\",",
    "\"fileName\":\"...jpg\",",
    "\"decision\":\"approve|review|reject\",",
    "\"overallScore\":0,",
    "\"sectionMatchScore\":0,",
    "\"premiumScore\":0,",
    "\"ageFitScore\":0,",
    "\"textOverlay\":false,",
    "\"watermark\":false,",
    "\"garmentVisible\":false,",
    "\"reasons\":[\"...\"],",
    "\"notes\":\"short Turkish note\"",
    "}",
    "Scores must be integers from 0 to 100."
  ].join("\n");
}
