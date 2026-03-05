"""Chunk transcripts into overlapping segments for embedding."""

import argparse
import json
import sys

from rich.console import Console

from scripts.config import (
    CHUNK_MAX_CHARS,
    CHUNK_MIN_CHARS,
    CHUNK_OVERLAP_SEGMENTS,
    TRANSCRIPTS_DIR,
    load_metadata,
    transcript_path,
)

console = Console()


def chunk_transcript(transcript: dict) -> list[dict]:
    """Split transcript segments into chunks of 600-1000 chars with overlap.

    Never splits mid-segment. Uses sliding window with 2-segment overlap.
    """
    segments = transcript.get("segments", [])
    if not segments:
        return []

    chunks = []
    i = 0

    while i < len(segments):
        chunk_segments = []
        char_count = 0

        # Accumulate segments until we hit the target size
        j = i
        while j < len(segments) and char_count < CHUNK_MIN_CHARS:
            text = segments[j]["text"].strip()
            char_count += len(text)
            chunk_segments.append(segments[j])
            j += 1

        # If we're under max, try to add more segments up to max
        while j < len(segments) and char_count < CHUNK_MAX_CHARS:
            text = segments[j]["text"].strip()
            if char_count + len(text) > CHUNK_MAX_CHARS:
                break
            char_count += len(text)
            chunk_segments.append(segments[j])
            j += 1

        if not chunk_segments:
            i += 1
            continue

        # Build chunk
        text = " ".join(seg["text"].strip() for seg in chunk_segments)
        speakers = sorted(set(seg.get("speaker", "Unknown") for seg in chunk_segments))

        chunks.append({
            "chunk_index": len(chunks),
            "text": text,
            "start_time": chunk_segments[0]["start"],
            "end_time": chunk_segments[-1]["end"],
            "speakers": speakers,
            "segment_ids": [seg["id"] for seg in chunk_segments],
        })

        # Advance with overlap
        segments_used = len(chunk_segments)
        advance = max(1, segments_used - CHUNK_OVERLAP_SEGMENTS)
        i += advance

    return chunks


def chunk_episode(glt_id: str, *, dry_run: bool = False) -> list[dict] | None:
    """Chunk a single episode transcript. Returns chunks or None if not found."""
    path = TRANSCRIPTS_DIR / f"{glt_id}.json"
    if not path.exists():
        console.print(f"[yellow]Transcript not found: {glt_id}[/yellow]")
        return None

    transcript = json.loads(path.read_text())
    chunks = chunk_transcript(transcript)
    meta = transcript.get("meta", {})

    if dry_run:
        console.print(f"[cyan]{glt_id}[/cyan] — {meta.get('title', 'Unknown')}")
        console.print(f"  Segments: {len(transcript.get('segments', []))}")
        console.print(f"  Chunks: {len(chunks)}")
        if chunks:
            lengths = [len(c["text"]) for c in chunks]
            console.print(f"  Chunk lengths: min={min(lengths)}, max={max(lengths)}, avg={sum(lengths)//len(lengths)}")
        return chunks

    # Save chunked output
    output_path = TRANSCRIPTS_DIR / f"{glt_id}.chunks.json"
    output = {
        "meta": meta,
        "chunks": chunks,
    }
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2))
    console.print(f"[green]✓[/green] {glt_id} — {len(chunks)} chunks → {output_path.name}")

    return chunks


def main() -> None:
    parser = argparse.ArgumentParser(description="Chunk transcripts for embedding")
    parser.add_argument("--episode", type=int, help="Process single episode by number")
    parser.add_argument("--glt-id", type=str, help="Process single episode by GLT ID")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving")
    args = parser.parse_args()

    metadata = load_metadata()

    if args.glt_id:
        chunk_episode(args.glt_id, dry_run=args.dry_run)
        return

    if args.episode:
        episode = next((ep for ep in metadata if ep.number == args.episode), None)
        if not episode:
            console.print(f"[red]Episode {args.episode} not found in metadata[/red]")
            sys.exit(1)
        chunk_episode(episode.glt_id, dry_run=args.dry_run)
        return

    # Process all transcribed episodes
    total_chunks = 0
    processed = 0

    for path in sorted(TRANSCRIPTS_DIR.glob("*.json")):
        if path.name == "metadata.json" or ".chunks." in path.name:
            continue
        glt_id = path.stem
        chunks = chunk_episode(glt_id, dry_run=args.dry_run)
        if chunks:
            total_chunks += len(chunks)
            processed += 1

    console.print(f"\n[bold]Processed {processed} episodes → {total_chunks} total chunks[/bold]")


if __name__ == "__main__":
    main()
