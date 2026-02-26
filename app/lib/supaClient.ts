import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types"; 

const supabaseUrl = import.meta.env.VITE_SUPABASE_API_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase Environment Variables");
}

/**
 * Modern SSR-compatible Supabase Client
 * Automatically syncs auth state with cookies for React Router Loaders
 */

// Pass <Database> here if you have generated types
export const supaClient = createBrowserClient<Database>(supabaseUrl, supabaseKey);