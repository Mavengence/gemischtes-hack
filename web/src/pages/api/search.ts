import type { APIRoute } from "astro";
import { supabase } from "@/lib/supabase";
import { embedQuery } from "@/lib/embed";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get("q");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);

  if (!query || query.trim().length < 2) {
    return new Response(JSON.stringify({ error: "Query too short" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Embed the query for semantic search
    const embedding = await embedQuery(query);

    // Run hybrid search (semantic + full-text)
    const { data: chunks, error } = await supabase.rpc("hybrid_search", {
      query_embedding: embedding,
      query_text: query,
      match_count: limit,
      semantic_weight: 0.7,
    });

    if (error) throw error;

    // Fetch episode details for matched chunks
    const episodeIds = [...new Set((chunks ?? []).map((c: { episode_id: number }) => c.episode_id))];
    const { data: episodes } = await supabase
      .from("episodes")
      .select("id, glt_id, title, episode_number, pub_date")
      .in("id", episodeIds);

    const episodeMap = new Map((episodes ?? []).map((e) => [e.id, e]));

    const results = (chunks ?? []).map((chunk: Record<string, unknown>) => ({
      ...chunk,
      episode: episodeMap.get(chunk.episode_id as number) ?? null,
    }));

    return new Response(JSON.stringify({ results, query }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
