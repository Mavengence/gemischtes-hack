/**
 * Embed a query string using a local embedding server (multilingual-e5-small).
 * The server runs at localhost:8787 via `python -m scripts.embed_server`.
 * Falls back to HuggingFace Inference API if HF_TOKEN is set.
 */

const LOCAL_URL = "http://127.0.0.1:8787";
const HF_MODEL = "intfloat/multilingual-e5-small";
const HF_API_URL = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`;

async function embedLocal(text: string): Promise<number[]> {
  const response = await fetch(LOCAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Local embed server error: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding;
}

async function embedHF(text: string, token: string): Promise<number[]> {
  // e5 models require "query: " prefix for queries
  const prefixed = `query: ${text}`;

  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      inputs: prefixed,
      normalize: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HF API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return Array.isArray(data[0]) ? data[0] : data;
}

export async function embedQuery(text: string): Promise<number[]> {
  // Try local server first (fastest, no rate limits)
  try {
    return await embedLocal(text);
  } catch {
    // Local server not running, fall back to HF API
  }

  const hfToken = import.meta.env.HF_TOKEN;
  if (hfToken) {
    return await embedHF(text, hfToken);
  }

  throw new Error(
    "No embedding backend available. Start the local server with: python -m scripts.embed_server",
  );
}
