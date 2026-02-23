import { useUser } from "./lib/sessionContext";
import { supaClient } from "app/lib/supaClient"

export default function UserMenu() {
  const { profile } = useUser();

  return (
    <>
      <div className="flex flex-col">
        <h2>Welcome {profile?.username || "dawg"}.</h2>
        <button
          onClick={() => supaClient.auth.signOut()}
          className="user-menu-logout-button"
        >
          Logout
        </button>
      </div>
    </>
  );
}