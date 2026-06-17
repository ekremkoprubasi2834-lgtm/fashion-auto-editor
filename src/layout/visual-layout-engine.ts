export type VisualLayoutType =
  | "single_focus"
  | "sequence_single"
  | "moodboard_2"
  | "moodboard_3"
  | "comparison_2"
  | "recap_grid"
  | "detail_focus";

type VisualLayoutInput = {
  chapter: string;
  itemTitle?: string | null;
  spokenText: string;
  visualIntent: string;
  searchKeywords: string[];
};

const RECAP_PATTERN = /\b(?:Und da hast du sie|Das waren|zum Schluss|finally|recap|Zusammenfassung)\b/i;
const COMPARISON_PATTERN = /\b(?:billig|stattdessen|instead|rather than|outdated|falsch|besser|vs)\b/i;
const MOODBOARD_3_PATTERN = /\b(?:Farbe|Farben|colors|color trends|palette|Trendfarbe|Mocha|Butter Yellow|Terracotta|Sage|Cobalt|verschiedene|mehrere)\b/i;
const DETAIL_PATTERN = /\b(?:Ärmel|Aermel|sleeves?|hoch(?:krempeln)?|Taille|belt|Gürtel|Guertel|button|buttons|fabric|Stoffe?|Linien|cuts?|details?)\b/i;
const VARIATION_PATTERN = /\b(?:Variante|Varianten|Vielseitigkeit|kombinieren|different ways|offen|locker|Top tragen)\b/i;
const SPECIFIC_OUTFIT_PATTERN = /\b(?:Hemd|shirt)\b.*\b(?:Hose|Hosen|pants|trousers|Jeans|Stoffhose)\b|\b(?:Hose|Hosen|pants|trousers|Jeans|Stoffhose)\b.*\b(?:Hemd|shirt)\b/i;

export function chooseVisualLayout(input: VisualLayoutInput): VisualLayoutType {
  const searchableText = [
    input.spokenText,
    input.visualIntent,
    input.searchKeywords.join(" ")
  ].join(" ");

  if (COMPARISON_PATTERN.test(searchableText)) {
    return "comparison_2";
  }

  if (input.chapter === "Outro" || RECAP_PATTERN.test(input.spokenText)) {
    return "recap_grid";
  }

  if (DETAIL_PATTERN.test(input.spokenText)) {
    return "detail_focus";
  }

  if (SPECIFIC_OUTFIT_PATTERN.test(input.spokenText)) {
    return "single_focus";
  }

  if (VARIATION_PATTERN.test(input.spokenText)) {
    return "moodboard_2";
  }

  if (MOODBOARD_3_PATTERN.test(searchableText)) {
    return "moodboard_3";
  }

  if (input.itemTitle) {
    return "sequence_single";
  }

  return "single_focus";
}
