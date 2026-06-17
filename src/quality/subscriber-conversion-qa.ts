export type SubscriberQaWarning = {
  code: string;
  message: string;
  suggestion?: string;
};

const SUBSCRIBE_PATTERN = /\b(?:abonnier\w*|abonnieren|abonniere|subscribe|abone)\b/i;
const CHANNEL_PROMISE_PATTERN = /\b(?:eleganter|hochwertiger|gepflegter|ohne ständig neue Kleidung|bessere Styling|Styling-Ideen|kleine Styling-Entscheidungen|mehr Eleganz)\b/i;
const COMMENT_TRIGGER_PATTERN = /\b(?:Kommentar|Kommentare|Schreib mir|Findest du|Würdest du|Welche|Was denkst du|comment)\b/i;
const GENERIC_CTA_PATTERN = /\b(?:liken,\s*abonnieren\s+und\s+die\s+Glocke|like\s+and\s+subscribe|beğen\s+ve\s+abone\s+ol)\b/i;

export function runSubscriberConversionQa(transcript: string): SubscriberQaWarning[] {
  const warnings: SubscriberQaWarning[] = [];

  if (!SUBSCRIBE_PATTERN.test(transcript)) {
    warnings.push({
      code: "subscriber-no-subscribe-cta",
      message: "No subscribe CTA detected.",
      suggestion: "Add a soft subscribe reason after the first useful item and again near the final CTA."
    });
  } else if (hasSubscribeOnlyInFinalThird(transcript)) {
    warnings.push({
      code: "subscriber-final-only-cta",
      message: "Subscribe CTA appears only near the end.",
      suggestion: "Add a soft channel promise after the first useful item because many viewers may not reach the end."
    });
  }

  if (!CHANNEL_PROMISE_PATTERN.test(transcript)) {
    warnings.push({
      code: "subscriber-no-channel-promise",
      message: "No clear channel promise detected.",
      suggestion: "Explain why the viewer should subscribe, not just ask them to subscribe."
    });
  }

  if (!COMMENT_TRIGGER_PATTERN.test(transcript)) {
    warnings.push({
      code: "subscriber-no-comment-trigger",
      message: "No comment trigger detected.",
      suggestion: "Add one specific fashion debate question instead of a generic comment request."
    });
  }

  if (GENERIC_CTA_PATTERN.test(transcript)) {
    warnings.push({
      code: "subscriber-generic-cta",
      message: "CTA sounds generic.",
      suggestion: "Give a specific reason to subscribe and ask a specific fashion question."
    });
  }

  return warnings;
}

function hasSubscribeOnlyInFinalThird(transcript: string): boolean {
  const thirdLength = Math.ceil(transcript.length / 3);
  const firstThird = transcript.slice(0, thirdLength);
  const middleThird = transcript.slice(thirdLength, thirdLength * 2);
  const finalThird = transcript.slice(thirdLength * 2);

  return !SUBSCRIBE_PATTERN.test(firstThird)
    && !SUBSCRIBE_PATTERN.test(middleThird)
    && SUBSCRIBE_PATTERN.test(finalThird);
}
