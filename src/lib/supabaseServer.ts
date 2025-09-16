import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/// <reference types="node" />

// Use globalThis to access process for environment variables
const processEnv = (globalThis as any).process?.env || {};

export const SUPABASE_BUCKET = processEnv.SUPABASE_BUCKET || "audio-recordings";

// Lazily create the Supabase admin client at request-time to avoid build-time env checks
export function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = processEnv.SUPABASE_URL || processEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = processEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "Supabase misconfiguration: set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in your environment"
    );
  }
  if (!supabaseServiceKey) {
    throw new Error(
      "Supabase misconfiguration: set SUPABASE_SERVICE_ROLE_KEY in your environment"
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}
