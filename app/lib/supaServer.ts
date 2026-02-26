import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { Database } from "./database.types";

export const getSupaServer = (request: Request) => {
  const headers = new Headers();

  const supaServer = createServerClient<Database>(
    import.meta.env.VITE_SUPABASE_API_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          // 1. Parse the header
          const cookies = parseCookieHeader(request.headers.get('Cookie') ?? '');
          // 2. Map it to ensure 'value' is never undefined (fixes the TS error)
          return cookies.map((cookie) => ({
            name: cookie.name,
            value: cookie.value ?? '',
          }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            headers.append("Set-Cookie", serializeCookieHeader(name, value, options))
          );
        },
      },
    }
  );

  return { supaServer, headers };
};
