# Gemischtes Hack — Podcast Insights

## Project Overview

Download all episodes of **Gemischtes Hack** (Felix Lobrecht & Tommi Schmitt), transcribe them, and build a website that surfaces insights from every episode.

## Podcast

- **Name:** Gemischtes Hack
- **Hosts:** Felix Lobrecht (comedian) & Tommi Schmitt (TV host)
- **Language:** German
- **Episodes:** 350+ (weekly since 2017)
- **Episode length:** 60–110 min
- **RSS Feed:** `https://feeds.megaphone.fm/GLT8390938385`
- **Audio:** DRM-free MP3s via Megaphone CDN (no auth required)
- **Video:** Spotify exclusive (not used in this project)

## Pipeline

1. **Download** — Fetch all episodes as compressed MP3 from the Megaphone RSS feed (GLT ID filenames)
2. **Transcribe** — Speech-to-text with mlx-whisper + speaker diarization with resemblyzer
3. **Chunk** — Split transcripts into 600-1000 char overlapping segments
4. **Embed** — Generate 384d embeddings with multilingual-e5-small
5. **Topics** — Extract topics with BERTopic (UMAP + HDBSCAN + c-TF-IDF)
6. **Summarize** — Episode summaries via Ollama (Llama 3.3, local)
7. **Upload** — Push everything to Supabase (pgvector)
8. **Website** — Astro + React frontend with RAG chatbot

## Tech Stack

- **Language:** Python 3.13
- **Download:** Custom Python script parsing RSS feed, downloading MP3s
- **Transcription:** mlx-whisper (large-v3-turbo) + resemblyzer (speaker embeddings) + k-means clustering
- **Speaker diarization:** 2 speakers per episode (Speaker A / Speaker B), ~0.7 min overhead per episode
- **Embeddings:** `intfloat/multilingual-e5-small` (384d, German-optimized)
- **Vector DB:** Supabase PostgreSQL + pgvector (HNSW index, hybrid search)
- **Topics:** BERTopic + KeyBERT-inspired representation
- **Summaries:** Ollama + Llama 3.3 (local, structured JSON output)
- **Frontend:** Astro + React islands + Tailwind (dark theme)
- **Chatbot:** Groq free tier (Llama 3.3 70B) + RAG with hybrid search
- **Query embedding:** HuggingFace Inference API (free, runtime)
- **Hosting:** Vercel free tier (hybrid SSR/SSG)
- **Storage:** Episodes in `episodes/`, transcripts in `transcripts/`

## Directory Structure

```
episodes/               — Downloaded MP3 files (gitignored)
episodes/metadata.json  — Episode metadata from RSS feed
transcripts/            — Transcript JSON + chunks + embeddings + summaries
  *.json                — Raw transcripts (segments with speaker labels)
  *.chunks.json         — Chunked transcripts (600-1000 char segments)
  *.embeddings.npz      — Numpy arrays of 384d embeddings
  *.summary.json        — LLM-generated summaries, topics, quotes
  topics.json           — Global topic clusters from BERTopic
scripts/
  config.py             — Shared config, paths, models, constants
  download.py           — RSS feed parser + MP3 downloader
  transcribe.py         — mlx-whisper transcription + speaker diarization
  pipeline.py           — Batch orchestrator (download → transcribe → delete)
  chunk.py              — Transcript chunking (sliding window, overlap)
  embed.py              — Embedding generation (sentence-transformers)
  topics.py             — Topic extraction (BERTopic)
  summarize.py          — Episode summaries (Ollama)
  upload.py             — Supabase upload (episodes, chunks, topics)
  process.py            — Processing orchestrator (chunk → embed → topics → summarize → upload)
db/
  schema.sql            — Supabase schema (episodes, chunks, topics, pgvector, RLS)
web/                    — Astro website
  src/pages/            — Astro pages (index, episodes, topics, chat)
  src/pages/api/        — API routes (search, chat, episodes, topics)
  src/components/react/ — React islands (ChatBot, SearchResults, TopicTimeline)
  src/lib/              — Supabase client, embedding helpers
```

## Key URLs

- RSS Feed: https://feeds.megaphone.fm/GLT8390938385
- MP3 pattern: https://traffic.megaphone.fm/GLT{ID}.mp3
- Spotify page: https://open.spotify.com/show/7BTOsF2boKmlYr76BelijW

## Commands

```bash
# Setup
make setup                              # Install core dependencies
make setup-web                          # Install web + processing dependencies

# Download & Transcribe
make metadata                           # Refresh RSS metadata
make transcribe                         # Run full download+transcribe pipeline
make test-one                           # Smoke test: download + transcribe 1 episode

# Processing Pipeline
make process                            # Run chunk → embed → topics → summarize (no upload)
make process-upload                     # Run full pipeline including Supabase upload
make chunk                              # Chunk all transcripts
make embed                              # Generate embeddings for all chunks
make topics                             # Extract topics with BERTopic
make summarize                          # Generate episode summaries with Ollama
make upload                             # Upload to Supabase

# Individual scripts
python -m scripts.download              # Download all episodes
python -m scripts.download --latest     # Download only new episodes
python -m scripts.download --metadata-only  # Update metadata.json only

python -m scripts.transcribe --episode 333  # Transcribe single episode
python -m scripts.transcribe --episode 333 --no-diarize  # Transcribe without speaker labels
python -m scripts.transcribe --glt-id GLT3505596872      # Transcribe by GLT ID
python -m scripts.transcribe --dry-run      # Preview what would be transcribed

python -m scripts.pipeline --batch-size 20  # Run pipeline with batch size
python -m scripts.pipeline --dry-run        # Preview batch plan

python -m scripts.chunk --episode 2 --dry-run   # Preview chunking for episode 2
python -m scripts.embed --episode 2              # Embed single episode
python -m scripts.summarize --episode 2          # Summarize single episode
python -m scripts.process --episode 2 --dry-run  # Preview full processing for episode 2
python -m scripts.process --skip topics upload   # Process without topics/upload

# Website
make dev                                # Start Astro dev server (localhost:4321)
make build                              # Build for production

# Cleanup
make clean                              # Remove MP3 files (preserves transcripts)
```

## Environment Variables

For the website and upload step:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key          # For web frontend (read-only)
SUPABASE_SERVICE_KEY=your-service-key    # For upload script (write access)
GROQ_API_KEY=your-groq-api-key          # For chatbot (Llama 3.3 70B)
```
