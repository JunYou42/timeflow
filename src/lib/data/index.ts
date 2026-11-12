"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { LocalRepository } from "@/lib/data/local-repository";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import type { Repository, StorageMode } from "@/lib/data/repository";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const FORCE_LOCAL_MODE = process.env.NEXT_PUBLIC_FORCE_LOCAL_MODE === "true";

export function isSupabaseConfigured(): boolean {
  return (
    !FORCE_LOCAL_MODE &&
    SUPABASE_URL.startsWith("http") &&
    SUPABASE_ANON_KEY.length > 20
  );
}

export function resolveStorageMode(): StorageMode {
  return isSupabaseConfigured() ? "supabase" : "local";
}

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. See README > Configuring Supabase.");
  }
  if (!supabaseClient) {
    supabaseClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

let repository: Repository | null = null;

/** Returns the single repository instance for the current runtime mode. */
export function getRepository(): Repository {
  if (repository) return repository;
  repository = isSupabaseConfigured()
    ? new SupabaseRepository(getSupabaseClient())
    : new LocalRepository();
  return repository;
}

/** Local Mode only -- wipes and re-seeds the browser dataset. */
export function resetLocalData(): void {
  const repo = getRepository();
  if (repo instanceof LocalRepository) repo.resetLocalData();
}

export type { Repository, StorageMode };
