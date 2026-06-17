export type VisualLayoutType = "single_blur" | "moodboard_3" | "comparison_2" | "recap_grid";

type VisualLayoutInput = {
  chapter: string;
  itemTitle?: string | null;
  spokenText: string;
  visualIntent: string;
  searchKeywords: string[];
};

const RECAP_PATTERN = /\b(?:Und da hast du sie|Das waren|zum Schluss|finally|recap|Zusammenfassung)\b/i;
const COMPARISON_PATTERN = /\b(?:billig|hochwertig|stattdessen|instead|rather than|outdated|modern|falsch|besser|vs)\b/i;
const MOODBOARD_PATTERN = /\b(?:Farbe|colors|color trends|palette|Trendfarbe|Mocha|Butter Yellow|Terracotta|Sage|Cobalt)\b/i;

export function chooseVisualLayout(input: VisualLayoutInput): VisualLayoutType {
  const searchableText = [
    input.spokenText,
    input.visualIntent,
    input.searchKeywords.join(" ")
  ].join(" ");

  if (input.chapter === "Outro" || RECAP_PATTERN.test(input.spokenText)) {
    return "recap_grid";
  }

  if (COMPARISON_PATTERN.test(searchableText)) {
    return "comparison_2";
  }

  if (MOODBOARD_PATTERN.test(searchableText)) {
    return "moodboard_3";
  }

  if (input.itemTitle) {
    return "moodboard_3";
  }

  return "single_blur";
}
