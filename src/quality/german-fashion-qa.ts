export type QualityWarning = {
  code: string;
  term: string;
  message: string;
  suggestion?: string;
};

type GermanFashionQaRule = QualityWarning & {
  pattern: RegExp;
};

const GERMAN_FASHION_QA_RULES: GermanFashionQaRule[] = [
  {
    code: "de-fashion-hemden-context",
    term: "Hemden",
    pattern: /\bHemden\b/i,
    message: "\"Hemden\" can sound masculine or less natural in women's fashion. Consider \"Blusen\", \"Hemdblusen\" or \"Leinenblusen\" depending on context."
  },
  {
    code: "de-fashion-satanbluse-typo",
    term: "Satanbluse",
    pattern: /\bSatanbluse\b/i,
    message: "Likely typo/transcription issue.",
    suggestion: "Satinbluse"
  },
  {
    code: "de-fashion-saturack-typo",
    term: "Saturack",
    pattern: /\bSaturack\b/i,
    message: "Likely typo/transcription issue.",
    suggestion: "Satinrock"
  },
  {
    code: "de-fashion-maxick-typo",
    term: "Maxick",
    pattern: /\bMaxick\b/i,
    message: "Likely typo/transcription issue.",
    suggestion: "Maxirock"
  },
  {
    code: "de-fashion-polkadotz-typo",
    term: "Polkadotz",
    pattern: /\bPolkadotz\b/i,
    message: "Non-standard German fashion wording.",
    suggestion: "Polka Dots / Pünktchenmuster"
  },
  {
    code: "de-fashion-widelhosen-typo",
    term: "Widelhosen",
    pattern: /\bWidelhosen\b/i,
    message: "Likely typo/transcription issue.",
    suggestion: "weite Hosen"
  },
  {
    code: "de-fashion-whiteelh-hosen-typo",
    term: "Whiteelh Hosen",
    pattern: /\bWhiteelh\s+Hosen\b/i,
    message: "Likely typo/transcription issue.",
    suggestion: "weiße Hosen"
  },
  {
    code: "de-fashion-satops-typo",
    term: "Satops",
    pattern: /\bSatops\b/i,
    message: "Likely typo/transcription issue.",
    suggestion: "Satin-Tops"
  },
  {
    code: "de-fashion-teilie-typo",
    term: "Teilie",
    pattern: /\bTeilie\b/i,
    message: "Likely typo/transcription issue.",
    suggestion: "Taille"
  },
  {
    code: "de-fashion-passformzelt-typo",
    term: "Passformzelt",
    pattern: /\bPassformzelt\b/i,
    message: "Likely typo/transcription issue.",
    suggestion: "Passform zählt"
  },
  {
    code: "de-fashion-seitenhemd-typo",
    term: "Seitenhemd",
    pattern: /\bSeitenhemd\b/i,
    message: "Likely typo/transcription issue in a fashion context.",
    suggestion: "Seidenhemd or Seidenbluse, depending on context"
  },
  {
    code: "de-fashion-beig-typo",
    term: "Beig",
    pattern: /\bBeig\b/i,
    message: "Likely incomplete or non-standard color term.",
    suggestion: "Beige"
  },
  {
    code: "de-fashion-schluppenkragen-context",
    term: "Schluppenkragen",
    pattern: /\bSchluppenkragen\b/i,
    message: "\"Schluppenkragen\" can be correct, but \"Bluse mit Schluppenkragen\" may sound more natural in context."
  }
];

export function runGermanFashionQa(transcript: string): QualityWarning[] {
  return GERMAN_FASHION_QA_RULES
    .filter((rule) => rule.pattern.test(transcript))
    .map(({ code, term, message, suggestion }) => ({
      code,
      term,
      message,
      suggestion
    }));
}
