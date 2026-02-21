import { createContext, useContext } from "react";
import { useSession, type UserInfo } from "../hooks/useSession";

const SessionContext = createContext<UserInfo | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

// Custom hook for easy access
export const useUser = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a SessionProvider");
  }
  return context;
};
