import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Episode = {
  id: number;
  glt_id: string;
  episode_number: number | null;
  title: string;
  pub_date: string;
  duration_seconds: number;
  description: string | null;
  summary: string | null;
  topics_json: string[] | null;
  quotes_json: { text: string; speaker: string; context: string }[] | null;
};

export type Chunk = {
  id: number;
  episode_id: number;
  chunk_index: number;
  text: string;
  start_time: number;
  end_time: number;
  speakers: string[];
};

export type Topic = {
  id: number;
  label: string;
  keywords: string[];
  chunk_count: number;
};

export type SearchResult = Chunk & {
  similarity?: number;
  score?: number;
  episode?: Episode;
};
