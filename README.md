# Gemischtes Hack — Transcript Dataset

351 episodes of **Gemischtes Hack** (Felix Lobrecht & Tommi Schmitt), fully transcribed in German with 2-speaker diarization.

Downloading and transcribing 350+ hours of audio takes a long time — this dataset saves you from doing it yourself.

## Dataset

| | |
|---|---|
| Episodes | 333 numbered + 18 specials = **351 total** |
| Language | German |
| Transcription | mlx-whisper `large-v3-turbo` |
| Diarization | resemblyzer + k-means (Speaker A / Speaker B) |
| Coverage | Episodes 1–334 + selected specials |

## Files

```
transcripts/
  episode_001_gemischtes_hack.json        — Episode 1
  episode_002_bereichsleiter.json         — Episode 2
  ...
  episode_333_deutsche_watergate.json     — Episode 333
  episode_334_forelle_auf_drei.json       — Episode 334
  special_best_of_2020.json               — Specials
  special_christian_ulmen_5_schnelle_fragen_an.json
  ...
  index.json                              — Master manifest (all episodes)
  README.md                               — Schema documentation
```

See [`transcripts/README.md`](transcripts/README.md) for the full JSON schema.

## Quick Start

```python
import json

# Load a single episode
with open("transcripts/episode_001_gemischtes_hack.json") as f:
    ep = json.load(f)

print(ep["meta"]["title"])          # #1 GEMISCHTES HACK
print(ep["meta"]["duration_seconds"])  # ~3600

for seg in ep["segments"][:5]:
    print(f"[{seg['speaker']}] {seg['text']}")
```

```python
# Search across all episodes via index
with open("transcripts/index.json") as f:
    index = json.load(f)

for ep in index["episodes"]:
    print(ep["episode_number"], ep["title"], ep["filename"])
```

## Transcript Format

Each file has two keys: `meta` and `segments`.

**`meta`** — episode metadata (title, pub_date, duration_seconds, glt_id, has_diarization, …)

**`segments`** — list of spoken utterances:

```json
{
  "id": 0,
  "start": 12.4,
  "end": 15.1,
  "text": "Willkommen bei Gemischtes Hack.",
  "speaker": "Speaker A",
  "avg_logprob": -0.21,
  "no_speech_prob": 0.003
}
```

Speaker labels are consistent within an episode but not across episodes (Speaker A may be Felix or Tommi depending on the episode).

## Reproducing the Dataset

If you want to transcribe future episodes yourself:

```bash
# Install dependencies
pip install -e ".[dev]"

# Refresh episode list from RSS
make metadata

# Download + transcribe new episodes
make transcribe

# Rename to human-readable filenames
make rename

# Rebuild index
make index
```

See the scripts for details:

| Script | Purpose |
|--------|---------|
| `scripts/download.py` | Parse RSS feed, download MP3s |
| `scripts/transcribe.py` | mlx-whisper transcription + resemblyzer diarization |
| `scripts/pipeline.py` | Batch orchestrator (download → transcribe → delete MP3) |
| `scripts/rename_transcripts.py` | Rename GLT IDs to human-readable filenames |
| `scripts/build_index.py` | Regenerate `transcripts/index.json` |

## Requirements

- Python 3.13
- macOS with Apple Silicon (mlx-whisper uses Metal GPU acceleration)
- ~500 MB disk per episode during transcription (MP3 deleted after)

## License

Transcripts are derived from the Gemischtes Hack podcast. Audio copyright belongs to Felix Lobrecht, Tommi Schmitt, and their distributors. This dataset is for research and personal use only.
