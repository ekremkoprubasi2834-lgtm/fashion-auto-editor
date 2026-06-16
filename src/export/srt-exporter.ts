import type { SceneSegment } from "../segmentation/segmenter.js";
import { secondsToTimecode } from "../utils/time.js";

export function exportSrt(segments: SceneSegment[]): string {
  return segments
    .map((segment, index) => {
      return [
        String(index + 1),
        `${secondsToTimecode(segment.startSeconds, true)} --> ${secondsToTimecode(segment.endSeconds, true)}`,
        segment.spokenText,
        ""
      ].join("\n");
    })
    .join("\n");
}
