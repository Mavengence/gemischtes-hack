"""Generate episode summaries using Ollama (local LLM)."""

from __future__ import annotations

import argparse
import json
import sys
import time

from rich.console import Console

from scripts.config import OLLAMA_MODEL, TRANSCRIPTS_DIR, load_metadata

console = Console()

SUMMARY_PROMPT = """Du bist ein Experte für den deutschen Podcast "Gemischtes Hack" von Felix Lobrecht und Tommi Schmitt.

Analysiere das folgende Transkript und erstelle eine strukturierte Zusammenfassung auf Deutsch.

Transkript (Auszug):
{text}

Erstelle eine JSON-Antwort mit folgendem Format:
{{
    "summary": "2-3 Sätze Zusammenfassung der Episode",
    "topics": ["Thema 1", "Thema 2", "Thema 3"],
    "quotes": [
        {{"text": "Zitat", "speaker": "Speaker A oder Speaker B", "context": "Kontext"}}
    ]
}}

Regeln:
- Zusammenfassung auf Deutsch, 2-3 Sätze
- 3-7 Hauptthemen der Episode
- 2-4 lustige oder bemerkenswerte Zitate mit Speaker-Zuordnung
- Speaker A ist meistens Felix Lobrecht, Speaker B ist meistens Tommi Schmitt
- Antworte NUR mit validem JSON, kein anderer Text"""


def build_transcript_excerpt(transcript: dict, max_chars: int = 8000) -> str:
    """Build a representative excerpt from the transcript for summarization."""
    segments = transcript.get("segments", [])
    if not segments:
        return transcript.get("text", "")[:max_chars]

    # Take segments from beginning, middle, and end
    total = len(segments)
    third = total // 3

    selected = (
        segments[:third]
        + segments[third : 2 * third]
        + segments[2 * third :]
    )

    lines = []
    char_count = 0
    for seg in selected:
        speaker = seg.get("speaker", "Unknown")
        text = seg["text"].strip()
        line = f"[{speaker}] {text}"
        if char_count + len(line) > max_chars:
            break
        lines.append(line)
        char_count += len(line)

    return "\n".join(lines)


def summarize_episode(
    glt_id: str,
    *,
    dry_run: bool = False,
    force: bool = False,
) -> dict | None:
    """Generate summary for a single episode."""
    transcript_file = TRANSCRIPTS_DIR / f"{glt_id}.json"
    output_path = TRANSCRIPTS_DIR / f"{glt_id}.summary.json"

    if not transcript_file.exists():
        console.print(f"[yellow]{glt_id} — transcript not found[/yellow]")
        return None

    if output_path.exists() and not force:
        console.print(f"[dim]{glt_id} — already summarized, skipping (use --force)[/dim]")
        return json.loads(output_path.read_text())

    transcript = json.loads(transcript_file.read_text())
    meta = transcript.get("meta", {})

    if dry_run:
        console.print(f"[cyan]{glt_id}[/cyan] — {meta.get('title', 'Unknown')}")
        return None

    import ollama

    excerpt = build_transcript_excerpt(transcript)
    prompt = SUMMARY_PROMPT.format(text=excerpt)

    start = time.time()

    response = ollama.chat(
        model=OLLAMA_MODEL,
        messages=[{"role": "user", "content": prompt}],
        format="json",
    )

    elapsed = time.time() - start

    try:
        result = json.loads(response["message"]["content"])
    except (json.JSONDecodeError, KeyError):
        console.print(f"[red]{glt_id} — failed to parse LLM response[/red]")
        console.print(response.get("message", {}).get("content", "")[:200])
        return None

    # Validate structure
    summary_data = {
        "glt_id": glt_id,
        "title": meta.get("title", ""),
        "episode_number": meta.get("episode_number"),
        "summary": result.get("summary", ""),
        "topics": result.get("topics", []),
        "quotes": result.get("quotes", []),
        "model": OLLAMA_MODEL,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }

    output_path.write_text(json.dumps(summary_data, ensure_ascii=False, indent=2))
    console.print(
        f"[green]✓[/green] {glt_id} — {meta.get('title', '')} ({elapsed:.1f}s)"
    )

    return summary_data


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate episode summaries with Ollama")
    parser.add_argument("--episode", type=int, help="Summarize single episode by number")
    parser.add_argument("--glt-id", type=str, help="Summarize single episode by GLT ID")
    parser.add_argument("--dry-run", action="store_true", help="Preview without processing")
    parser.add_argument("--force", action="store_true", help="Re-summarize even if exists")
    args = parser.parse_args()

    metadata = load_metadata()

    if args.glt_id:
        summarize_episode(args.glt_id, dry_run=args.dry_run, force=args.force)
        return

    if args.episode:
        episode = next((ep for ep in metadata if ep.number == args.episode), None)
        if not episode:
            console.print(f"[red]Episode {args.episode} not found[/red]")
            sys.exit(1)
        summarize_episode(episode.glt_id, dry_run=args.dry_run, force=args.force)
        return

    # Process all transcribed episodes
    processed = 0
    transcript_files = sorted(TRANSCRIPTS_DIR.glob("*.json"))

    for path in transcript_files:
        if any(x in path.name for x in [".chunks.", ".summary.", ".embeddings.", "topics.", "metadata."]):
            continue
        glt_id = path.stem
        result = summarize_episode(glt_id, dry_run=args.dry_run, force=args.force)
        if result:
            processed += 1

    console.print(f"\n[bold]Summarized {processed} episodes[/bold]")


if __name__ == "__main__":
    main()
