/**
 * =========================================================
 * timeAgo Utility
 * =========================================================
 *
 * Converts a date into a human-readable relative time string.
 *
 * Examples:
 * - "just now"
 * - "5 minutes ago"
 * - "2 days ago"
 */
export function timeAgo(date: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(date).getTime()) / 1000
  );

  if (seconds < 5) return "just now";

  const intervals: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
    [1, "second"],
  ];

  for (const [secondsInUnit, label] of intervals) {
    const interval = Math.floor(seconds / secondsInUnit);

    if (interval >= 1) {
      return `${interval} ${label}${interval > 1 ? "s" : ""}`;
    }
  }

  return "just now";
}