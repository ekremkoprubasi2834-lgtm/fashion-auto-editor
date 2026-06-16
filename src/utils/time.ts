export function secondsToTimecode(totalSeconds: number, includeMilliseconds = false): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000);

  const base = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");

  if (!includeMilliseconds) {
    return base;
  }

  return `${base},${String(milliseconds).padStart(3, "0")}`;
}

export function formatDurationRange(startSeconds: number, endSeconds: number): string {
  return `${secondsToTimecode(startSeconds)} - ${secondsToTimecode(endSeconds)}`;
}
