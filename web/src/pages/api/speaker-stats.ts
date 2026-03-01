import type { APIRoute } from "astro";
import { supabase } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    // Get all chunks with speaker info and duration
    const { data: chunks, error } = await supabase
      .from("chunks")
      .select("speakers, start_time, end_time");

    if (error) throw error;

    let felixSeconds = 0;
    let tommiSeconds = 0;
    let felixChunks = 0;
    let tommiChunks = 0;
    let totalChunks = chunks?.length ?? 0;

    for (const chunk of chunks ?? []) {
      const duration = chunk.end_time - chunk.start_time;
      const hasSpeakerA = chunk.speakers.includes("Speaker A");
      const hasSpeakerB = chunk.speakers.includes("Speaker B");

      if (hasSpeakerA && !hasSpeakerB) {
        felixSeconds += duration;
        felixChunks++;
      } else if (hasSpeakerB && !hasSpeakerA) {
        tommiSeconds += duration;
        tommiChunks++;
      } else if (hasSpeakerA && hasSpeakerB) {
        // Split evenly for mixed chunks
        felixSeconds += duration / 2;
        tommiSeconds += duration / 2;
        felixChunks++;
        tommiChunks++;
      }
    }

    const totalSeconds = felixSeconds + tommiSeconds;
    const felixPercent = totalSeconds > 0 ? Math.round((felixSeconds / totalSeconds) * 100) : 50;
    const tommiPercent = 100 - felixPercent;

    return new Response(
      JSON.stringify({
        felix: {
          seconds: Math.round(felixSeconds),
          minutes: Math.round(felixSeconds / 60),
          chunks: felixChunks,
          percent: felixPercent,
        },
        tommi: {
          seconds: Math.round(tommiSeconds),
          minutes: Math.round(tommiSeconds / 60),
          chunks: tommiChunks,
          percent: tommiPercent,
        },
        totalChunks,
        totalMinutes: Math.round((felixSeconds + tommiSeconds) / 60),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stats fetch failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
