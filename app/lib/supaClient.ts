import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types"; 

const supabaseUrl = import.meta.env.VITE_SUPABASE_API_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase Environment Variables");
}

// Pass <Database> here if you have generated types
export const supaClient = createClient<Database>(supabaseUrl, supabaseKey);