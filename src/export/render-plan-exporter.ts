import type { VideoRenderPlan } from "../render/render-plan-builder.js";

export function exportRenderPlan(renderPlan: VideoRenderPlan): string {
  return JSON.stringify(renderPlan, null, 2) + "\n";
}
