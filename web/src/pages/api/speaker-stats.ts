import type { APIRoute } from "astro";
import { supabase } from "@/lib/supabase";

export const prerender = false;

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export const GET: APIRoute = async () => {
  try {
    const { data: chunks, error } = await supabase
      .from("chunks")
      .select("text, speakers, start_time, end_time");

    if (error) throw error;

    let felixSeconds = 0;
    let tommiSeconds = 0;
    let felixChunks = 0;
    let tommiChunks = 0;
    let felixWords = 0;
    let tommiWords = 0;
    let felixLongest = 0;
    let tommiLongest = 0;
    const totalChunks = chunks?.length ?? 0;

    for (const chunk of chunks ?? []) {
      const duration = chunk.end_time - chunk.start_time;
      const words = countWords(chunk.text);
      const hasSpeakerA = chunk.speakers.includes("Speaker A");
      const hasSpeakerB = chunk.speakers.includes("Speaker B");

      if (hasSpeakerA && !hasSpeakerB) {
        felixSeconds += duration;
        felixChunks++;
        felixWords += words;
        if (duration > felixLongest) felixLongest = duration;
      } else if (hasSpeakerB && !hasSpeakerA) {
        tommiSeconds += duration;
        tommiChunks++;
        tommiWords += words;
        if (duration > tommiLongest) tommiLongest = duration;
      } else if (hasSpeakerA && hasSpeakerB) {
        felixSeconds += duration / 2;
        tommiSeconds += duration / 2;
        felixChunks++;
        tommiChunks++;
        felixWords += Math.round(words / 2);
        tommiWords += Math.round(words / 2);
      }
    }

    const totalSeconds = felixSeconds + tommiSeconds;
    const felixPercent = totalSeconds > 0 ? Math.round((felixSeconds / totalSeconds) * 100) : 50;
    const tommiPercent = 100 - felixPercent;

    const totalWords = felixWords + tommiWords;
    const felixWordsPercent = totalWords > 0 ? Math.round((felixWords / totalWords) * 100) : 50;
    const tommiWordsPercent = 100 - felixWordsPercent;

    const totalChunksSpeaker = felixChunks + tommiChunks;
    const felixChunksPercent = totalChunksSpeaker > 0 ? Math.round((felixChunks / totalChunksSpeaker) * 100) : 50;
    const tommiChunksPercent = 100 - felixChunksPercent;

    const felixAvgDuration = felixChunks > 0 ? felixSeconds / felixChunks : 0;
    const tommiAvgDuration = tommiChunks > 0 ? tommiSeconds / tommiChunks : 0;
    const totalAvgDuration = felixAvgDuration + tommiAvgDuration;
    const felixAvgPercent = totalAvgDuration > 0 ? Math.round((felixAvgDuration / totalAvgDuration) * 100) : 50;
    const tommiAvgPercent = 100 - felixAvgPercent;

    const totalLongest = felixLongest + tommiLongest;
    const felixLongestPercent = totalLongest > 0 ? Math.round((felixLongest / totalLongest) * 100) : 50;
    const tommiLongestPercent = 100 - felixLongestPercent;

    return new Response(
      JSON.stringify({
        felix: {
          seconds: Math.round(felixSeconds),
          minutes: Math.round(felixSeconds / 60),
          chunks: felixChunks,
          percent: felixPercent,
          words: felixWords,
          wordsPercent: felixWordsPercent,
          chunksPercent: felixChunksPercent,
          avgDuration: Math.round(felixAvgDuration * 10) / 10,
          avgPercent: felixAvgPercent,
          longestSegment: Math.round(felixLongest),
          longestPercent: felixLongestPercent,
        },
        tommi: {
          seconds: Math.round(tommiSeconds),
          minutes: Math.round(tommiSeconds / 60),
          chunks: tommiChunks,
          percent: tommiPercent,
          words: tommiWords,
          wordsPercent: tommiWordsPercent,
          chunksPercent: tommiChunksPercent,
          avgDuration: Math.round(tommiAvgDuration * 10) / 10,
          avgPercent: tommiAvgPercent,
          longestSegment: Math.round(tommiLongest),
          longestPercent: tommiLongestPercent,
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
