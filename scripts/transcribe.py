"""Transcribe Gemischtes Hack episodes with speaker diarization.

Combines mlx-whisper (transcription) + resemblyzer (speaker embeddings)
to produce transcripts with Speaker A / Speaker B labels.
"""

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from rich.console import Console

from scripts.config import (
    EPISODES_DIR,
    LANGUAGE,
    TRANSCRIPTS_DIR,
    WHISPER_MODEL,
    EpisodeMeta,
    is_transcribed,
    load_metadata,
    transcript_path,
)

console = Console()

NUM_SPEAKERS = 2

# Minimum segment duration in seconds for embedding extraction
MIN_SEGMENT_DURATION = 0.5


def load_diarization_pipeline():
    """Load resemblyzer voice encoder for speaker embedding extraction."""
    from resemblyzer import VoiceEncoder

    console.print("[dim]Loading speaker embedding model...[/dim]")
    encoder = VoiceEncoder()
    console.print("[dim]VoiceEncoder ready (CPU)[/dim]")
    return encoder


def diarize_with_embeddings(
    encoder,
    audio_path: Path,
    whisper_segments: list[dict],
) -> list[dict]:
    """Assign speaker labels to whisper segments using resemblyzer embeddings.

    Extracts a speaker embedding for each whisper segment, then clusters
    them into NUM_SPEAKERS groups using k-means.
    """
    from resemblyzer import preprocess_wav
    from sklearn.cluster import KMeans

    wav = preprocess_wav(str(audio_path))
    sample_rate = 16000  # resemblyzer uses 16kHz

    embeddings = []
    valid_indices = []

    for i, seg in enumerate(whisper_segments):
        start_sample = int(seg["start"] * sample_rate)
        end_sample = int(seg["end"] * sample_rate)

        # Skip segments that are too short for reliable embedding
        if (end_sample - start_sample) / sample_rate < MIN_SEGMENT_DURATION:
            continue

        segment_wav = wav[start_sample:end_sample]
        if len(segment_wav) < sample_rate * MIN_SEGMENT_DURATION:
            continue

        embedding = encoder.embed_utterance(segment_wav)
        embeddings.append(embedding)
        valid_indices.append(i)

    if len(embeddings) < NUM_SPEAKERS:
        console.print("  [yellow]Too few segments for diarization[/yellow]")
        return [{**seg, "speaker": "Unknown"} for seg in whisper_segments]

    # Cluster embeddings into NUM_SPEAKERS groups
    embedding_matrix = np.array(embeddings)
    kmeans = KMeans(n_clusters=NUM_SPEAKERS, random_state=42, n_init=10)
    labels = kmeans.fit_predict(embedding_matrix)

    # Map cluster labels to Speaker A, Speaker B (Speaker A = most common)
    label_counts = np.bincount(labels, minlength=NUM_SPEAKERS)
    sorted_labels = np.argsort(-label_counts)  # most common first
    cluster_to_speaker = {
        int(cluster): f"Speaker {chr(ord('A') + rank)}"
        for rank, cluster in enumerate(sorted_labels)
    }

    # Assign speakers to all segments
    result = []
    label_idx = 0
    for i, seg in enumerate(whisper_segments):
        if label_idx < len(valid_indices) and i == valid_indices[label_idx]:
            speaker = cluster_to_speaker[int(labels[label_idx])]
            label_idx += 1
        else:
            # For skipped segments, inherit from nearest valid neighbor
            speaker = "Unknown"
            if label_idx > 0:
                speaker = cluster_to_speaker[int(labels[label_idx - 1])]
            elif label_idx < len(labels):
                speaker = cluster_to_speaker[int(labels[label_idx])]

        result.append({
            **seg,
            "speaker": speaker,
        })

    return result


def transcribe_episode(
    episode: EpisodeMeta,
    diarization_pipeline=None,
    model: str = WHISPER_MODEL,
    force: bool = False,
) -> Path | None:
    """Transcribe a single episode with speaker diarization."""
    import mlx_whisper

    audio_path = EPISODES_DIR / episode.filename
    out_path = transcript_path(episode)

    if not audio_path.exists():
        console.print(f"  [red]Audio not found:[/red] {audio_path.name}")
        return None

    if not force and is_transcribed(episode):
        console.print(f"  [dim]Already transcribed:[/dim] {out_path.name}")
        return out_path

    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

    console.print(f"  [blue]Transcribing:[/blue] {episode.title}")
    start = time.time()

    # Step 1: Whisper transcription
    console.print("  [dim]Step 1: Running whisper...[/dim]")
    whisper_start = time.time()
    try:
        result = mlx_whisper.transcribe(
            str(audio_path),
            path_or_hf_repo=model,
            language=LANGUAGE,
            verbose=False,
        )
    except Exception as e:
        console.print(f"  [red]Transcription failed:[/red] {e}")
        return None
    whisper_elapsed = time.time() - whisper_start
    console.print(f"  [dim]Whisper done in {whisper_elapsed / 60:.1f} min[/dim]")

    # Step 2: Build whisper segments
    whisper_segments = [
        {
            "id": seg["id"],
            "start": seg["start"],
            "end": seg["end"],
            "text": seg["text"],
            "avg_logprob": seg.get("avg_logprob", 0.0),
            "no_speech_prob": seg.get("no_speech_prob", 0.0),
        }
        for seg in result.get("segments", [])
    ]

    # Step 3: Speaker diarization (if encoder provided)
    has_diarization = False
    if diarization_pipeline is not None:
        console.print("  [dim]Step 2: Running speaker diarization...[/dim]")
        diar_start = time.time()
        try:
            aligned = diarize_with_embeddings(
                diarization_pipeline, audio_path, whisper_segments
            )
            has_diarization = any(s["speaker"] != "Unknown" for s in aligned)
        except Exception as e:
            console.print(f"  [yellow]Diarization failed (continuing without):[/yellow] {e}")
            aligned = [{**seg, "speaker": "Unknown"} for seg in whisper_segments]
        diar_elapsed = time.time() - diar_start
        console.print(f"  [dim]Diarization done in {diar_elapsed / 60:.1f} min[/dim]")
    else:
        aligned = [{**seg, "speaker": "Unknown"} for seg in whisper_segments]

    elapsed = time.time() - start
    duration = aligned[-1]["end"] if aligned else 0.0

    transcript = {
        "meta": {
            "episode_number": episode.number,
            "title": episode.title,
            "pub_date": episode.pub_date,
            "filename": episode.filename,
            "glt_id": episode.glt_id,
            "model": model,
            "language": LANGUAGE,
            "transcribed_at": datetime.now(timezone.utc).isoformat(),
            "duration_seconds": round(duration),
            "processing_seconds": round(elapsed, 1),
            "num_speakers": NUM_SPEAKERS,
            "has_diarization": has_diarization,
        },
        "text": result.get("text", ""),
        "segments": aligned,
    }

    out_path.write_text(json.dumps(transcript, indent=2, ensure_ascii=False))

    speed = duration / elapsed if elapsed > 0 else 0
    console.print(
        f"  [green]Done:[/green] {elapsed / 60:.1f} min "
        f"({speed:.1f}x realtime) -> {out_path.name}"
    )
    return out_path


def find_episodes_to_transcribe(
    episodes: list[EpisodeMeta],
    force: bool = False,
) -> list[EpisodeMeta]:
    """Return episodes that have audio files but no transcript yet."""
    result = []
    for ep in episodes:
        if not (EPISODES_DIR / ep.filename).exists():
            continue
        if force or not is_transcribed(ep):
            result.append(ep)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe with speaker diarization")
    parser.add_argument("--episode", type=int, metavar="N",
                        help="Transcribe only episode number N")
    parser.add_argument("--glt-id", type=str, metavar="ID",
                        help="Transcribe by GLT ID (e.g. GLT3505596872)")
    parser.add_argument("--force", action="store_true",
                        help="Re-transcribe even if transcript exists")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be transcribed")
    parser.add_argument("--no-diarize", action="store_true",
                        help="Skip speaker diarization (transcribe only)")
    args = parser.parse_args()

    metadata = load_metadata()
    if not metadata:
        console.print("[red]No metadata found. Run: python -m scripts.download --metadata-only[/red]")
        return

    # Select episodes
    if args.episode is not None:
        to_transcribe = [ep for ep in metadata if ep.number == args.episode]
        if not to_transcribe:
            console.print(f"[red]Episode #{args.episode} not found.[/red]")
            return
    elif args.glt_id:
        to_transcribe = [ep for ep in metadata if ep.glt_id == args.glt_id]
        if not to_transcribe:
            console.print(f"[red]GLT ID {args.glt_id} not found.[/red]")
            return
    else:
        to_transcribe = find_episodes_to_transcribe(metadata, force=args.force)

    console.print(f"\nEpisodes to transcribe: [bold]{len(to_transcribe)}[/bold]")

    if args.dry_run:
        for ep in to_transcribe:
            audio = EPISODES_DIR / ep.filename
            exists = "[green]ready[/green]" if audio.exists() else "[red]missing[/red]"
            dur_min = ep.duration_seconds // 60
            console.print(f"  #{ep.number or '?'} ({ep.glt_id}): {ep.title} ({dur_min} min) {exists}")
        return

    if not to_transcribe:
        console.print("[dim]Nothing to transcribe.[/dim]")
        return

    # Load diarization pipeline (once, reuse for all episodes)
    diarization_pipeline = None
    if not args.no_diarize:
        try:
            diarization_pipeline = load_diarization_pipeline()
        except SystemExit:
            return

    total_duration = sum(ep.duration_seconds for ep in to_transcribe)
    console.print(f"Total audio: [bold]{total_duration / 3600:.1f}h[/bold]")
    if diarization_pipeline:
        console.print("[green]Speaker diarization: enabled[/green]")
    else:
        console.print("[yellow]Speaker diarization: disabled[/yellow]")
    console.print()

    succeeded = 0
    failed = 0

    for i, ep in enumerate(to_transcribe):
        console.print(f"\n[{i + 1}/{len(to_transcribe)}] #{ep.number or '?'} ({ep.glt_id}): {ep.title}")
        result = transcribe_episode(
            ep,
            diarization_pipeline=diarization_pipeline,
            force=args.force,
        )
        if result:
            succeeded += 1
        else:
            failed += 1

    console.print(f"\n{'=' * 60}")
    console.print(f"Transcribed: [green]{succeeded}[/green] | Failed: [red]{failed}[/red]")


if __name__ == "__main__":
    main()
