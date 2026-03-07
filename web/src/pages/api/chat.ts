import type { APIRoute } from "astro";
import { supabase } from "@/lib/supabase";
import { embedQuery } from "@/lib/embed";

export const prerender = false;

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-2.0-flash";

const BERLINER_PROMPT = `Du bist entweder Felix Lobrecht (Speaker A) oder Tommi Schmitt (Speaker B) — je nachdem, wer in den Quellen hauptsaechlich gesprochen hat. Antworte in direkter Rede, in der Ich-Form, als waerst du diese Person. Berliner Slang, kurz und knackig, maximal 2-3 Saetze. Keine Episodennummern oder Zeitangaben im Text — die sieht man in den Quellen.`;

const NEUTRAL_PROMPT = `Du bist entweder Felix Lobrecht (Speaker A) oder Tommi Schmitt (Speaker B) — je nachdem, wer in den Quellen hauptsaechlich gesprochen hat. Antworte in direkter Rede, in der Ich-Form, als waerst du diese Person. Antworte auf Deutsch, kurz und praezise in 2-3 Saetzen, basierend nur auf den Transkript-Ausschnitten. Keine Episodennummern oder Zeitangaben im Text.`;

type Chunk = {
  text: string;
  start_time: number;
  end_time: number;
  speakers: string[];
  episode_id: number;
  episode?: { title: string; episode_number: number | null; glt_id: string };
  score?: number;
};

function formatContext(chunks: Chunk[]): string {
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

function buildSources(chunks: Chunk[]) {
  return chunks.map((chunk) => ({
    episode_title: chunk.episode?.title ?? "Unbekannt",
    episode_number: chunk.episode?.episode_number,
    glt_id: chunk.episode?.glt_id,
    timestamp: Math.floor(chunk.start_time / 60),
    score: chunk.score,
  }));
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
}

async function tryStreamLLM(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<Response | null> {
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: 200,
        temperature: 0.5,
      }),
    });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

function streamLLMResponse(
  llmResponse: Response,
  sources: ReturnType<typeof buildSources>,
  encoder: TextEncoder,
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`));

      const reader = llmResponse.body?.getReader();
      if (!reader) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
}

function streamFallback(
  enrichedChunks: Chunk[],
  sources: ReturnType<typeof buildSources>,
  encoder: TextEncoder,
): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ fallback: true })}\n\n`));

      for (const chunk of enrichedChunks) {
        const ep = chunk.episode;
        const num = ep?.episode_number ? `#${ep.episode_number}` : "";
        const title = ep?.title ?? "";
        const mins = Math.floor(chunk.start_time / 60);
        const text = `**${num} ${title}, ~${mins}min:** ${chunk.text}\n\n`;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let body: { message: string; history?: Array<{ role: string; content: string }>; useSlang?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { message, history = [], useSlang = true } = body;
  if (!message || message.trim().length < 2) {
    return new Response(JSON.stringify({ error: "Message too short" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const embedding = await embedQuery(message);

    const { data: chunks, error: searchError } = await supabase.rpc("hybrid_search", {
      query_embedding: embedding,
      query_text: message,
      match_count: 5,
      semantic_weight: 0.7,
    });

    if (searchError) throw searchError;

    const episodeIds = [...new Set((chunks ?? []).map((c: { episode_id: number }) => c.episode_id))];
    const { data: episodes } = await supabase.from("episodes").select("*").in("id", episodeIds);
    const episodeMap = new Map((episodes ?? []).map((e) => [e.id, e]));

    const enrichedChunks: Chunk[] = (chunks ?? []).map((chunk: Record<string, unknown>) => ({
      ...chunk,
      episode: episodeMap.get(chunk.episode_id as number),
    })) as Chunk[];

    const context = formatContext(enrichedChunks);
    const sources = buildSources(enrichedChunks);
    const encoder = new TextEncoder();

    const systemPrompt = useSlang ? BERLINER_PROMPT : NEUTRAL_PROMPT;
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6),
      {
        role: "user",
        content: `Kontext aus dem Podcast:\n\n${context}\n\nFrage: ${message}`,
      },
    ];

    // Try Groq first
    const groqKey = import.meta.env.GROQ_API_KEY;
    if (groqKey) {
      const groqResponse = await tryStreamLLM(GROQ_API_URL, groqKey, GROQ_MODEL, messages);
      if (groqResponse) {
        return new Response(
          streamLLMResponse(groqResponse, sources, encoder),
          { headers: sseHeaders() },
        );
      }
    }

    // Try Gemini Flash fallback
    const geminiKey = import.meta.env.GEMINI_API_KEY;
    if (geminiKey) {
      const geminiResponse = await tryStreamLLM(GEMINI_API_URL, geminiKey, GEMINI_MODEL, messages);
      if (geminiResponse) {
        return new Response(
          streamLLMResponse(geminiResponse, sources, encoder),
          { headers: sseHeaders() },
        );
      }
    }

    // Both failed — stream raw chunks as fallback
    return new Response(
      streamFallback(enrichedChunks, sources, encoder),
      { headers: sseHeaders() },
    );
  } catch (err) {
    const message_err = err instanceof Error ? err.message : "Chat failed";
    return new Response(JSON.stringify({ error: message_err }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
