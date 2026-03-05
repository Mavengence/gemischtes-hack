<p align="center">
  <img src="logo.svg" alt="Gemischtes Hack" width="560">
</p>

<p align="center">
  <b>351 episodes · fully transcribed · 2-speaker diarization · German</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/episodes-351-informational" alt="351 episodes">
  <img src="https://img.shields.io/badge/language-German-blue" alt="German">
  <img src="https://img.shields.io/badge/whisper-large--v3--turbo-green" alt="whisper large-v3-turbo">
  <img src="https://img.shields.io/badge/license-research%20only-lightgrey" alt="research only">
</p>

---

Transcripts for every episode of **Gemischtes Hack** — the German comedy podcast by Felix Lobrecht and Tommi Schmitt (weekly since 2017). Downloading and transcribing 350+ hours of audio takes days — this dataset saves you from doing it yourself.

## Contents

- [Dataset overview](#dataset-overview)
- [File structure](#file-structure)
- [Quick start](#quick-start)
- [Transcript format](#transcript-format)
- [Reproducing the dataset](#reproducing-the-dataset)
- [Requirements](#requirements)
- [License](#license)

---

## Dataset overview

| Field | Value |
|---|---|
| Total episodes | **351** (333 numbered + 18 specials) |
| Coverage | Episodes 1–334 + selected specials |
| Language | German |
| Transcription model | mlx-whisper `large-v3-turbo` |
| Diarization | resemblyzer + k-means · 2 speakers per episode |
| Speaker labels | `Speaker A` / `Speaker B` (consistent within episode) |

---

## File structure

```
transcripts/
├── episode_001_gemischtes_hack.json
├── episode_002_bereichsleiter.json
├── ...
├── episode_333_deutsche_watergate.json
├── episode_334_forelle_auf_drei.json
├── special_best_of_2020.json
├── special_christian_ulmen_5_schnelle_fragen_an.json
├── ...
├── index.json          ← master manifest of all 351 episodes
└── README.md           ← full JSON schema docs
scripts/
├── download.py         ← RSS feed parser + MP3 downloader
├── transcribe.py       ← mlx-whisper + resemblyzer diarization
├── pipeline.py         ← batch orchestrator
├── rename_transcripts.py
├── build_index.py
└── ...
```

**Naming convention:**
- Numbered episodes → `episode_{NNN}_{slug}.json`
- Specials → `special_{slug}.json`

See [`transcripts/README.md`](transcripts/README.md) for the full JSON schema.

---

## Quick start

```python
import json

# Load one episode
with open("transcripts/episode_001_gemischtes_hack.json") as f:
    ep = json.load(f)

print(ep["meta"]["title"])             # #1 GEMISCHTES HACK
print(ep["meta"]["duration_seconds"])  # 3542.8

for seg in ep["segments"][:3]:
    print(f"[{seg['speaker']}] {seg['text']}")
# [Speaker A] Willkommen bei Gemischtes Hack.
# [Speaker B] Ja, hallo zusammen.
```

```python
# Browse the full episode list
with open("transcripts/index.json") as f:
    index = json.load(f)

for ep in index["episodes"]:
    print(ep["episode_number"], ep["title"], ep["filename"])
```

---

## Transcript format

Each `episode_*.json` / `special_*.json` has two top-level keys:

### `meta`

```json
{
  "episode_number": 1,
  "title": "#1 GEMISCHTES HACK",
  "pub_date": "Mon, 01 Jan 2018 06:00:00 +0000",
  "glt_id": "GLT7330974999",
  "filename": "episode_001_gemischtes_hack.json",
  "model": "mlx-community/whisper-large-v3-turbo",
  "language": "de",
  "duration_seconds": 3542.8,
  "num_speakers": 2,
  "has_diarization": true
}
```

### `segments`

```json
[
  {
    "id": 0,
    "start": 12.4,
    "end": 15.1,
    "text": "Willkommen bei Gemischtes Hack.",
    "speaker": "Speaker A",
    "avg_logprob": -0.21,
    "no_speech_prob": 0.003
  }
]
```

| Field | Type | Description |
|---|---|---|
| `id` | int | Segment index (0-based) |
| `start` / `end` | float | Timestamps in seconds |
| `text` | string | Transcribed text |
| `speaker` | string | `"Speaker A"` or `"Speaker B"` |
| `avg_logprob` | float | Whisper confidence (higher = better) |
| `no_speech_prob` | float | Silence probability (lower = better) |

> **Note:** Speaker labels are consistent within an episode but not across episodes — Speaker A in episode 50 may be Felix or Tommi.

---

## Reproducing the dataset

To transcribe new episodes as they're released:

```bash
# 1. Install dependencies
pip install -e ".[dev]"

# 2. Pull latest episode list from RSS
make metadata

# 3. Download + transcribe new episodes (auto-skips already done)
make transcribe

# 4. Rename output files to human-readable names
make rename

# 5. Rebuild the index
make index
```

| Script | Purpose |
|---|---|
| `scripts/download.py` | Parse RSS feed, download MP3s from Megaphone CDN |
| `scripts/transcribe.py` | mlx-whisper transcription + resemblyzer speaker diarization |
| `scripts/pipeline.py` | Batch orchestrator — download → transcribe → delete MP3 |
| `scripts/rename_transcripts.py` | Rename `GLT*.json` → `episode_NNN_slug.json` |
| `scripts/build_index.py` | Regenerate `transcripts/index.json` |

---

## Requirements

- Python 3.13
- macOS with Apple Silicon (mlx-whisper uses Metal GPU acceleration)
- ~500 MB temporary disk space per episode (MP3 is deleted after transcription)

---

## License

Transcripts are derived from the Gemischtes Hack podcast. Audio copyright belongs to Felix Lobrecht, Tommi Schmitt, and their distributors. This dataset is intended for research and personal use only — not for commercial redistribution.
