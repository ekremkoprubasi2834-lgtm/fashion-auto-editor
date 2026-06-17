import type { SegmentationResult } from "../segmentation/segmenter.js";
import type { TranscriptResult } from "../transcription/transcriber.js";

interface GermanFashionWarningRule {
  term: string;
  pattern: RegExp;
  warning: string;
}

const GERMAN_FASHION_WARNING_RULES: GermanFashionWarningRule[] = [
  {
    term: "Hemden",
    pattern: /\bHemden\b/i,
    warning: "Warning: \"Hemden\" can sound masculine or less natural in women's fashion. Consider \"Blusen\", \"Hemdblusen\" or \"Leinenblusen\" depending on context."
  },
  {
    term: "Satanbluse",
    pattern: /\bSatanbluse\b/i,
    warning: "Warning: likely typo/transcription issue. Use \"Satinbluse\"."
  },
  {
    term: "Saturack",
    pattern: /\bSaturack\b/i,
    warning: "Warning: likely typo/transcription issue. Use \"Satinrock\"."
  },
  {
    term: "Maxick",
    pattern: /\bMaxick\b/i,
    warning: "Warning: likely typo/transcription issue. Use \"Maxirock\"."
  },
  {
    term: "Polkadotz",
    pattern: /\bPolkadotz\b/i,
    warning: "Warning: use \"Polka Dots\" or \"Pünktchenmuster\"."
  },
  {
    term: "Widelhosen",
    pattern: /\bWidelhosen\b/i,
    warning: "Warning: use \"weite Hosen\"."
  },
  {
    term: "Whiteelh Hosen",
    pattern: /\bWhiteelh\s+Hosen\b/i,
    warning: "Warning: use \"weiße Hosen\"."
  },
  {
    term: "Satops",
    pattern: /\bSatops\b/i,
    warning: "Warning: use \"Satin-Tops\"."
  },
  {
    term: "Teilie",
    pattern: /\bTeilie\b/i,
    warning: "Warning: use \"Taille\"."
  },
  {
    term: "Passformzelt",
    pattern: /\bPassformzelt\b/i,
    warning: "Warning: use \"Passform zählt\"."
  }
];

export function exportQualityReport(transcript: TranscriptResult, segmentation: SegmentationResult): string {
  const chapterCount = segmentation.chapters.length;
  const itemCount = countItems(segmentation);
  const sceneCount = segmentation.scenes.length;
  const germanWarnings = findGermanFashionWarnings(transcript.text);
  const lines: string[] = [
    "# Quality Report",
    "",
    "## Summary",
    "",
    `- Transcript source: ${transcript.source} via ${transcript.provider}`,
    `- Total chapters: ${chapterCount}`,
    `- Total items: ${itemCount}`,
    `- Total scenes: ${sceneCount}`,
    "",
    "## Detected Structure",
    ""
  ];

  for (const chapter of segmentation.chapters) {
    lines.push(`- Chapter: ${chapter.chapter}`);

    if (chapter.scenes) {
      lines.push(`  - Scenes: ${chapter.scenes.length}`);
    }

    if (chapter.items) {
      lines.push(`  - Items: ${chapter.items.length}`);

      for (const item of chapter.items) {
        lines.push(`  - Item ${item.itemIndex}: ${item.itemTitle} (${item.scenes.length} scene${item.scenes.length === 1 ? "" : "s"})`);
      }
    }
  }

  lines.push(
    "",
    "## Count Consistency Warnings",
    ""
  );

  if (segmentation.qualityWarnings.length === 0) {
    lines.push("- None");
  } else {
    lines.push(...segmentation.qualityWarnings.map((warning) => `- ${warning}`));
  }

  lines.push(
    "",
    "## German Fashion QA Warnings",
    ""
  );

  if (germanWarnings.length === 0) {
    lines.push("- None");
  } else {
    lines.push(...germanWarnings.map((warning) => `- ${warning}`));
  }

  lines.push(
    "",
    "## Trust Notes",
    "",
    "- Kişi hedef alınmamalı, styling tercihi yorumlanmalı.",
    "- Yorum almak için dil hatası bırakılmamalı.",
    "- Abone çağrısı sadece sona bırakılmamalı.",
    "- Başlık, intro, body ve outro madde sayısı tutarlı olmalı."
  );

  return lines.join("\n") + "\n";
}

function countItems(segmentation: SegmentationResult): number {
  return segmentation.chapters.reduce((total, chapter) => total + (chapter.items?.length ?? 0), 0);
}

function findGermanFashionWarnings(transcript: string): string[] {
  return GERMAN_FASHION_WARNING_RULES
    .filter((rule) => rule.pattern.test(transcript))
    .map((rule) => `${rule.term}: ${rule.warning}`);
}
