# Transcripts

360+ episodes of **Gemischtes Hack** (Felix Lobrecht & Tommi Schmitt), fully transcribed in German with 2-speaker diarization.

## File Naming

Files are named by Megaphone GLT ID: `{glt_id}.json` (e.g. `GLT1009653979.json`).
GLT IDs are not human-readable — use `index.json` to look up episodes by number or title.

## index.json

`index.json` is a generated manifest of all episodes:

```json
{
  "generated_at": "2026-03-05T...",
  "total_episodes": 360,
  "episodes": [
    {
      "episode_number": 1,
      "title": "#1 ...",
      "glt_id": "GLT...",
      "filename": "GLT....json",
      "pub_date": "Mon, 01 Jan 2018 ...",
      "duration_seconds": 4123,
      "has_diarization": true
    }
  ]
}
```

Episodes are sorted by `episode_number` (ascending). Specials with no episode number appear at the end.

Regenerate after adding new transcripts:

```bash
make index
```

## Transcript JSON Schema

Each `GLT*.json` file has two top-level keys: `meta` and `segments`.

### `meta` fields

| Field | Type | Description |
|-------|------|-------------|
| `episode_number` | int or null | Episode number (null for specials) |
| `title` | string | Episode title from RSS feed |
| `pub_date` | string | RFC 2822 publication date |
| `filename` | string | Original MP3 filename |
| `glt_id` | string | Megaphone GLT identifier |
| `model` | string | Whisper model used for transcription |
| `language` | string | Detected language (always `"de"`) |
| `transcribed_at` | string | ISO 8601 timestamp of transcription |
| `duration_seconds` | float | Audio duration in seconds |
| `processing_seconds` | float | Total transcription + diarization time |
| `num_speakers` | int | Number of speakers (always 2) |
| `has_diarization` | bool | Whether speaker labels were assigned |

### `segments` fields

Each segment is a spoken utterance:

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Segment index (0-based) |
| `start` | float | Start time in seconds |
| `end` | float | End time in seconds |
| `text` | string | Transcribed text |
| `speaker` | string | `"Speaker A"` or `"Speaker B"` (if diarized) |
| `avg_logprob` | float | Whisper confidence (higher = more confident) |
| `no_speech_prob` | float | Probability segment is silence (lower = better) |

## Speaker Labels

- **Speaker A** — the more talkative speaker in that episode
- **Speaker B** — the other speaker

Speaker labels are consistent within an episode but not across episodes (Speaker A in episode 50 may be Felix or Tommi). Diarization adds ~0.7 min overhead per episode.

Episodes without diarization have `has_diarization: false` and no `speaker` field on segments.
