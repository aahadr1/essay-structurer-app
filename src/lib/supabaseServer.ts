import { createClient } from "@supabase/supabase-js";

/// <reference types="node" />

// Use require to access process for environment variables
const processEnv = (globalThis as any).process?.env || {};

// Prefer non-public server var, fallback to NEXT_PUBLIC for local dev
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

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export const SUPABASE_BUCKET = processEnv.SUPABASE_BUCKET || "audio-recordings";
