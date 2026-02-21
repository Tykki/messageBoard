import { useEffect, useState, useRef } from "react";
import type { Session, RealtimeChannel } from "@supabase/supabase-js";
import { supaClient } from "../lib/supaClient";

export interface UserProfile {
  username: string;
  avatar_url?: string; // Standardized to Postgres snake_case
}

export interface UserInfo {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
}

export function useSession(): UserInfo {
  const [userInfo, setUserInfo] = useState<UserInfo>({
    session: null,
    profile: null,
    loading: true,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    // 1. Unified Auth Listener (Handles initial check + all changes)
    const { data: { subscription } } = supaClient.auth.onAuthStateChange(
      async (event, session) => {
        setUserInfo((prev) => ({ ...prev, session, loading: !session }));

        if (session?.user) {
          await fetchAndListenToProfile(session.user.id);
        } else {
          stopListening();
          setUserInfo({ session: null, profile: null, loading: false });
        }
      }
    );

    async function fetchAndListenToProfile(userId: string) {
      // 2. Fetch initial profile using .single() for cleaner code
      const { data } = await supaClient
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (data) {
        setUserInfo((prev) => ({ ...prev, profile: data as UserProfile, loading: false }));
      }

      // 3. Setup Realtime Listener
      stopListening(); // Clear old one if it exists

      const channel = supaClient
        .channel(`public:user_profiles:user_id=eq.${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_profiles",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            setUserInfo((prev) => ({ ...prev, profile: payload.new as UserProfile }));
          }
        )
        .subscribe();

      channelRef.current = channel;
    }

    function stopListening() {
      if (channelRef.current) {
        supaClient.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    }

    // 4. Global Cleanup for the entire hook
    return () => {
      subscription.unsubscribe();
      stopListening();
    };
  }, []);

  return userInfo;
}
