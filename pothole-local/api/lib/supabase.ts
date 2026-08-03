import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseAdmin: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      normalizeSupabaseUrl(requireEnv("SUPABASE_URL")),
      requireEnv("SUPABASE_SECRET_KEY"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }
  return supabaseAdmin;
}

export function getStorageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "pothole-images";
}
