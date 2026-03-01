import type { APIRoute } from "astro";
import { supabase } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const { gltId } = params;

  if (!gltId) {
    return new Response(JSON.stringify({ error: "Missing gltId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch episode
  const { data: episode, error: epError } = await supabase
    .from("episodes")
    .select("*")
    .eq("glt_id", gltId)
    .single();

  if (epError || !episode) {
    return new Response(JSON.stringify({ error: "Episode not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch chunks (transcript segments)
  const { data: chunks } = await supabase
    .from("chunks")
    .select("chunk_index, text, start_time, end_time, speakers")
    .eq("episode_id", episode.id)
    .order("chunk_index", { ascending: true });

  // Fetch topic associations
  const { data: topicLinks } = await supabase
    .from("episode_topics")
    .select("topic_id, relevance, topics(label, keywords)")
    .eq("episode_id", episode.id)
    .order("relevance", { ascending: false });

  return new Response(
    JSON.stringify({
      episode,
      chunks: chunks ?? [],
      topics: topicLinks ?? [],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
