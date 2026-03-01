"""Shared configuration for the Gemischtes Hack pipeline."""

import json
from pathlib import Path

from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EPISODES_DIR = PROJECT_ROOT / "episodes"
TRANSCRIPTS_DIR = PROJECT_ROOT / "transcripts"
METADATA_FILE = EPISODES_DIR / "metadata.json"

WHISPER_MODEL = "mlx-community/whisper-large-v3-turbo"
LANGUAGE = "de"

RSS_FEED_URL = "https://feeds.megaphone.fm/GLT8390938385"
USER_AGENT = "GemischtesHackDownloader/1.0"

# Embedding
EMBEDDING_MODEL = "intfloat/multilingual-e5-small"
EMBEDDING_DIM = 384

# Chunking
CHUNK_MIN_CHARS = 600
CHUNK_MAX_CHARS = 1000
CHUNK_OVERLAP_SEGMENTS = 2

# Ollama (local LLM for summaries)
OLLAMA_MODEL = "llama3.3"


class EpisodeMeta(BaseModel):
    """Metadata for a single podcast episode."""

    number: int | None
    title: str
    pub_date: str
    duration_seconds: int
    audio_url: str
    guid: str
    description: str
    filename: str
    glt_id: str


def load_metadata() -> list[EpisodeMeta]:
    """Load episode metadata from the JSON file."""
    if not METADATA_FILE.exists():
        return []
    data = json.loads(METADATA_FILE.read_text())
    return [EpisodeMeta(**ep) for ep in data]


def transcript_path(episode: EpisodeMeta) -> Path:
    """Return the transcript JSON path for an episode."""
    stem = Path(episode.filename).stem
    return TRANSCRIPTS_DIR / f"{stem}.json"


def is_transcribed(episode: EpisodeMeta) -> bool:
    """Check if an episode already has a valid transcript."""
    path = transcript_path(episode)
    if not path.exists():
        return False
    try:
        data = json.loads(path.read_text())
        return "segments" in data and "meta" in data
    except (json.JSONDecodeError, KeyError):
        return False
