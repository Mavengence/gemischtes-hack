import type { APIRoute } from "astro";
import { supabase } from "@/lib/supabase";
import { embedQuery } from "@/lib/embed";

export const prerender = false;

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `Du bist ein hilfreicher Assistent für den Podcast "Gemischtes Hack" von Felix Lobrecht und Tommi Schmitt.
Du antwortest immer auf Deutsch. Du basierst deine Antworten NUR auf den bereitgestellten Transkript-Ausschnitten.
Wenn du keine passende Information findest, sage das ehrlich.
Nenne immer die Episode und den ungefähren Zeitpunkt, wenn du zitierst.
Speaker A ist meistens Felix Lobrecht, Speaker B ist meistens Tommi Schmitt.`;

function formatContext(
  chunks: Array<{
    text: string;
    start_time: number;
    end_time: number;
    speakers: string[];
    episode?: { title: string; episode_number: number | null; glt_id: string };
  }>,
): string {
  return chunks
    .map((chunk, i) => {
      const ep = chunk.episode;
      const title = ep?.title ?? "Unbekannt";
      const num = ep?.episode_number ? `#${ep.episode_number}` : "";
      const mins = Math.floor(chunk.start_time / 60);
      const speakers = chunk.speakers.join(", ");
      return `[Quelle ${i + 1}: ${num} ${title}, ab Minute ${mins}, ${speakers}]\n${chunk.text}`;
    })
    .join("\n\n");
}

export const POST: APIRoute = async ({ request }) => {
  const groqKey = import.meta.env.GROQ_API_KEY;
  if (!groqKey) {
    return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { message: string; history?: Array<{ role: string; content: string }> };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { message, history = [] } = body;
  if (!message || message.trim().length < 2) {
    return new Response(JSON.stringify({ error: "Message too short" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Embed user query and search for relevant chunks
    const embedding = await embedQuery(message);

    const { data: chunks, error: searchError } = await supabase.rpc("hybrid_search", {
      query_embedding: embedding,
      query_text: message,
      match_count: 8,
      semantic_weight: 0.7,
    });

    if (searchError) throw searchError;

    // Fetch episode info for context
    const episodeIds = [...new Set((chunks ?? []).map((c: { episode_id: number }) => c.episode_id))];
    const { data: episodes } = await supabase.from("episodes").select("*").in("id", episodeIds);
    const episodeMap = new Map((episodes ?? []).map((e) => [e.id, e]));

    const enrichedChunks = (chunks ?? []).map((chunk: Record<string, unknown>) => ({
      ...chunk,
      episode: episodeMap.get(chunk.episode_id as number),
    }));

    const context = formatContext(enrichedChunks);

    // Build messages for Groq
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-6), // Keep last 3 exchanges
      {
        role: "user",
        content: `Kontext aus dem Podcast:\n\n${context}\n\nFrage: ${message}`,
      },
    ];

    // Stream response from Groq
    const groqResponse = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        stream: true,
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      throw new Error(`Groq API error: ${groqResponse.status} ${errText}`);
    }

    // Build sources array for the client
    const sources = enrichedChunks.map(
      (chunk: {
        episode?: { title: string; episode_number: number | null; glt_id: string };
        start_time: number;
        score?: number;
      }) => ({
        episode_title: chunk.episode?.title ?? "Unbekannt",
        episode_number: chunk.episode?.episode_number,
        glt_id: chunk.episode?.glt_id,
        timestamp: Math.floor(chunk.start_time / 60),
        score: chunk.score,
      }),
    );

    // Forward streaming response with sources prepended
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send sources as first SSE event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`));

        // Stream Groq response
        const reader = groqResponse.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                }
              } catch {
                // Skip malformed SSE chunks
              }
            }
          }
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message_err = err instanceof Error ? err.message : "Chat failed";
    return new Response(JSON.stringify({ error: message_err }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
