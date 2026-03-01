import type { APIRoute } from "astro";
import { supabase } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async () => {
  const { data: topics, error } = await supabase
    .from("topics")
    .select("*")
    .order("chunk_count", { ascending: false })
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ topics: topics ?? [] }), {
    headers: { "Content-Type": "application/json" },
  });
};
