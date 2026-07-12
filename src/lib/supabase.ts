import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Lazily created so the app still boots (with a "not configured" banner)
// before the user fills in .env.
export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null;
