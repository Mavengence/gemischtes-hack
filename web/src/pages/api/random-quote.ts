import type { APIRoute } from "astro";
import { supabase } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const count = Math.min(Number(url.searchParams.get("count") ?? 5), 20);

  try {
    const { count: totalChunks } = await supabase
      .from("chunks")
      .select("id", { count: "exact", head: true });

    if (!totalChunks || totalChunks === 0) {
      return new Response(JSON.stringify({ quotes: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const quotes: {
      text: string;
      speaker: string;
      episode_title: string | null;
      episode_number: number | null;
    }[] = [];

    // Fetch random chunks
    const attempts = count * 3;
    for (let i = 0; i < attempts && quotes.length < count; i++) {
      const offset = Math.floor(Math.random() * totalChunks);
      const { data: chunks } = await supabase
        .from("chunks")
        .select("text, speakers, episode_id")
        .range(offset, offset);

      const chunk = chunks?.[0];
      if (!chunk) continue;
      if (chunk.text.length < 60 || chunk.text.length > 400) continue;

      const { data: episode } = await supabase
        .from("episodes")
        .select("title, episode_number")
        .eq("id", chunk.episode_id)
        .single();

      quotes.push({
        text: chunk.text.trim(),
        speaker: chunk.speakers[0] ?? "Speaker A",
        episode_title: episode?.title ?? null,
        episode_number: episode?.episode_number ?? null,
      });
    }

    return new Response(JSON.stringify({ quotes }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
