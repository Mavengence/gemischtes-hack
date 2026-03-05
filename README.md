# Gemischtes Hack — Podcast Insights

Full pipeline to download, transcribe, and surface insights from every episode of **Gemischtes Hack** — the German comedy podcast by Felix Lobrecht and Tommi Schmitt (350+ episodes since 2017).

## Architecture

```
RSS Feed
  → Download (MP3)
  → Transcribe (mlx-whisper + resemblyzer diarization)
  → Chunk (sliding window, 600–1000 chars)
  → Embed (multilingual-e5-small, 384d)
  → Topics (BERTopic)
  → Summarize (Ollama / Llama 3.3)
  → Upload (Supabase + pgvector)
  → Website (Astro + RAG chatbot)
```

## Directory Structure

```
episodes/               MP3 downloads (gitignored)
episodes/metadata.json  Episode metadata from RSS feed
transcripts/            Transcript JSON files
  GLT*.json             Raw transcripts (segments + speaker labels)
  GLT*.chunks.json      Chunked transcripts (600–1000 char segments)
  GLT*.embeddings.npz   384d embeddings per chunk
  GLT*.summary.json     LLM-generated summaries, topics, quotes
  index.json            Master episode manifest (generated)
  topics.json           Global topic clusters from BERTopic
scripts/
  config.py             Shared config, paths, models, constants
  download.py           RSS parser + MP3 downloader
  transcribe.py         mlx-whisper transcription + speaker diarization
  pipeline.py           Batch orchestrator (download → transcribe → delete)
  chunk.py              Transcript chunking (sliding window, overlap)
  embed.py              Embedding generation (sentence-transformers)
  topics.py             Topic extraction (BERTopic)
  summarize.py          Episode summaries (Ollama)
  upload.py             Supabase upload (episodes, chunks, topics)
  process.py            Processing orchestrator (chunk → embed → topics → summarize → upload)
  build_index.py        Generate transcripts/index.json from all transcript files
db/
  schema.sql            Supabase schema (episodes, chunks, topics, pgvector, RLS)
web/                    Astro website
  src/pages/            Astro pages
  src/pages/api/        API routes (search, chat, episodes, topics)
  src/components/react/ React islands (ChatBot, EpisodeViewer, etc.)
  src/lib/              Supabase client, embedding helpers
```

## Quick Start

```bash
# 1. Install dependencies
make setup

# 2. Set environment variables (see section below)
cp .env.example .env  # edit with your keys

# 3. Fetch episode list
make metadata

# 4. Download + transcribe all episodes
make transcribe
```

## Transcribing Future Episodes

When new episodes are released:

```bash
make metadata    # refresh RSS → episodes/metadata.json
make transcribe  # pipeline auto-detects untranscribed episodes
```

The pipeline skips already-transcribed episodes (checks for existing `transcripts/GLT*.json`).

## Processing Pipeline

After transcribing, run the full processing pipeline to populate Supabase:

```bash
make process-upload   # chunk → embed → topics → summarize → upload
```

Or run individual steps:

```bash
make chunk      # chunk transcripts into segments
make embed      # generate embeddings for all chunks
make topics     # extract topics with BERTopic
make summarize  # generate episode summaries with Ollama
make upload     # upload everything to Supabase
```

Single episode:

```bash
python -m scripts.process --episode 2            # full pipeline for episode 2
python -m scripts.process --skip topics upload   # skip BERTopic and upload
```

## Transcript Index

Transcripts are named by GLT ID (not human-readable). Generate the episode manifest:

```bash
make index   # writes transcripts/index.json
```

See `transcripts/README.md` for full schema documentation.

## Website

```bash
make dev     # start dev server at localhost:4321
make build   # production build
```

The website uses:
- Astro + React islands + Tailwind (dark theme)
- RAG chatbot powered by Groq (Llama 3.3 70B) + Supabase hybrid search
- Hosted on Vercel free tier

## Individual Script Reference

```bash
# Download
python -m scripts.download                    # download all episodes
python -m scripts.download --latest           # download only new episodes
python -m scripts.download --metadata-only    # update metadata.json only

# Transcribe
python -m scripts.transcribe --episode 333          # single episode by number
python -m scripts.transcribe --glt-id GLT3505596872 # single episode by GLT ID
python -m scripts.transcribe --no-diarize           # skip speaker diarization
python -m scripts.transcribe --dry-run              # preview without running

# Pipeline (batch download + transcribe)
python -m scripts.pipeline --batch-size 20   # process 20 episodes
python -m scripts.pipeline --dry-run         # preview batch plan

# Processing
python -m scripts.chunk --episode 2 --dry-run   # preview chunking
python -m scripts.embed --episode 2              # embed single episode
python -m scripts.summarize --episode 2          # summarize single episode
```

## Environment Variables

| Variable | Required for | Description |
|----------|-------------|-------------|
| `SUPABASE_URL` | upload, website | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | website | Read-only public key for frontend |
| `SUPABASE_SERVICE_KEY` | upload | Write-access key for upload script |
| `GROQ_API_KEY` | website chatbot | Groq API key (Llama 3.3 70B, free tier) |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | Python 3.13 |
| Transcription | mlx-whisper (large-v3-turbo) |
| Diarization | resemblyzer + k-means (2 speakers) |
| Embeddings | intfloat/multilingual-e5-small (384d) |
| Vector DB | Supabase PostgreSQL + pgvector (HNSW) |
| Topics | BERTopic (UMAP + HDBSCAN + c-TF-IDF) |
| Summaries | Ollama + Llama 3.3 (local) |
| Frontend | Astro + React + Tailwind |
| Chatbot | Groq (Llama 3.3 70B) + RAG |
| Hosting | Vercel free tier |
