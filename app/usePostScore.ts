import { useEffect, useRef, useState } from "react";
import { supaClient } from "./lib/supaClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * =========================================================
 * usePostScore (Realtime Score Hook)
 * =========================================================
 *
 * Purpose:
 * - Subscribes to Supabase realtime updates for post score
 * - Keeps UI in sync instantly when votes change
 *
 * Why this is still client-side:
 * - Realtime subscriptions MUST run in the browser
 * - This complements server-driven data, not replaces it
 *
 * Usage:
 * const score = usePostScore(post.id, post.score);
 */
export function usePostScore(
  postId: string,
  initialScore: number | undefined
) {
  const [score, setScore] = useState<number | undefined>(initialScore);

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    // Initialize score if needed
    if (score === undefined && initialScore !== undefined) {
      setScore(initialScore);
    }

    // Prevent duplicate subscriptions
    if (!postId || channelRef.current) return;

    /**
     * -----------------------------------------------------
     * CREATE REALTIME SUBSCRIPTION
     * -----------------------------------------------------
     */
    const channel = supaClient
      .channel(`post_score_${postId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "post_score",
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          const newScore = (payload.new as { score: number })?.score;

          if (typeof newScore === "number") {
            setScore(newScore);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    /**
     * -----------------------------------------------------
     * CLEANUP
     * -----------------------------------------------------
     */
    return () => {
      if (channelRef.current) {
        supaClient.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [postId, initialScore, score]);

  return score;
}