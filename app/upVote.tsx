import React from "react";

/**
 * =========================================================
 * UpVote Component
 * =========================================================
 *
 * Reusable vote button (up/down)
 *
 * Features:
 * - Direction-based styling
 * - Filled state (user voted)
 * - Disabled state (auth/loading)
 * - Accessible
 */
export function UpVote({
  direction,
  filled = false,
  enabled = true,
}: {
  direction: "up" | "down";
  filled?: boolean;
  enabled?: boolean;
}) {
  /**
   * ---------------------------------------------------------
   * CLASS COMPUTATION (simple → no useMemo needed)
   * ---------------------------------------------------------
   */
  let classes = "";

  if (direction === "down") {
    classes += " origin-center rotate-180";
  }

  if (filled) {
    classes += direction === "up" ? " fill-green-400 glow" : " fill-red-400 glow";
  } else {
    classes += " fill-white";
  }

  if (!enabled) {
    classes += " opacity-50";
  }

  return (
    <button
      type="submit" // 🔥 important for fetcher.Form
      disabled={!enabled}
      aria-label={`${direction} vote`}
      data-e2e={`${direction}vote`}
      data-filled={filled}
    >
      <svg
        className={classes}
        width="24"
        height="24"
        viewBox="0 0 24 24"
      >
        <path d="M12.781 2.375c-.381-.475-1.181-.475-1.562 0l-8 10A1.001 1.001 0 0 0 4 14h4v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7h4a1.001 1.001 0 0 0 .781-1.625l-8-10zM15 12h-1v8h-4v-8H6.081L12 4.601 17.919 12H15z" />
      </svg>
    </button>
  );
}