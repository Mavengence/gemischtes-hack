import type { APIRoute } from "astro";
import { supabase } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    // Get a random chunk that has exactly one speaker (clear attribution)
    // Use a random offset for variety
    const { count } = await supabase
      .from("chunks")
      .select("id", { count: "exact", head: true });

    if (!count || count === 0) {
      return new Response(JSON.stringify({ error: "No chunks available" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Try up to 5 times to find a single-speaker chunk with good text length
    for (let attempt = 0; attempt < 5; attempt++) {
      const offset = Math.floor(Math.random() * count);
      const { data: chunks } = await supabase
        .from("chunks")
        .select("id, text, speakers, start_time, end_time, episode_id")
        .range(offset, offset);

      const chunk = chunks?.[0];
      if (!chunk) continue;

      // Only use chunks with exactly one speaker and reasonable length
      if (chunk.speakers.length !== 1) continue;
      if (chunk.text.length < 80 || chunk.text.length > 500) continue;

      // Get episode info
      const { data: episode } = await supabase
        .from("episodes")
        .select("title, episode_number, pub_date")
        .eq("id", chunk.episode_id)
        .single();

      return new Response(
        JSON.stringify({
          quote: chunk.text.trim(),
          speaker: chunk.speakers[0],
          episode: episode
            ? {
                title: episode.title,
                episode_number: episode.episode_number,
                pub_date: episode.pub_date,
              }
            : null,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // Fallback: just get any chunk
    const offset = Math.floor(Math.random() * count);
    const { data: chunks } = await supabase
      .from("chunks")
      .select("id, text, speakers, episode_id")
      .range(offset, offset);

    const chunk = chunks?.[0];
    if (!chunk) {
      return new Response(JSON.stringify({ error: "No chunk found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: episode } = await supabase
      .from("episodes")
      .select("title, episode_number, pub_date")
      .eq("id", chunk.episode_id)
      .single();

    return new Response(
      JSON.stringify({
        quote: chunk.text.trim(),
        speaker: chunk.speakers[0] ?? "Speaker A",
        episode: episode
          ? {
              title: episode.title,
              episode_number: episode.episode_number,
              pub_date: episode.pub_date,
            }
          : null,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Quiz fetch failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
