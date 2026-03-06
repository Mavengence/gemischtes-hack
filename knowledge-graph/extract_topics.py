"""Extract topics and summaries from podcast transcripts using OpenAI GPT-5.4.

Reads each transcript JSON from ../transcripts/, sends representative excerpts
to GPT-5.4, and saves structured topic + summary data to data/episode_topics.json.

Usage:
    python extract_topics.py                    # process all episodes
    python extract_topics.py --dry-run          # estimate cost without calling API
    python extract_topics.py --resume           # skip already-processed episodes
    python extract_topics.py --episode 42       # process single episode
    python extract_topics.py --limit 5          # process first N unprocessed episodes
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import httpx
from openai import OpenAI
from pydantic import BaseModel
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn

console = Console()

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TRANSCRIPTS_DIR = PROJECT_ROOT / "transcripts"
DATA_DIR = Path(__file__).resolve().parent / "data"
OUTPUT_FILE = DATA_DIR / "episode_topics.json"

MODEL = "gpt-5.4"
MAX_EXCERPT_CHARS = 8000


class Quote(BaseModel):
    text: str
    speaker: str
    context: str


class EpisodeExtraction(BaseModel):
    summary: str
    topics: list[str]
    quotes: list[Quote]


SYSTEM_PROMPT = """\
Du bist ein Experte für den deutschen Podcast "Gemischtes Hack" von Felix Lobrecht und Tommi Schmitt.
Du analysierst Transkripte und extrahierst strukturierte Informationen.
Antworte NUR mit validem JSON."""

EXTRACTION_PROMPT = """\
Analysiere das folgende Transkript-Auszug einer Podcast-Episode und erstelle:

1. Eine kurze Zusammenfassung (2-3 Sätze, Deutsch)
2. Eine Liste von 5-10 konkreten Themen, über die gesprochen wird
3. 2-4 lustige oder bemerkenswerte Zitate

WICHTIG für die Themen:
- Verwende kurze, prägnante Labels (1-4 Wörter)
- Sei spezifisch: "Berliner Clubszene" statt "Freizeit"
- Mische verschiedene Ebenen: konkrete Themen (z.B. "Champions League Finale") UND wiederkehrende Kategorien (z.B. "Dating", "Kindheit")
- Speaker A ist meistens Felix Lobrecht, Speaker B ist meistens Tommi Schmitt

Episode: {title} (#{episode_number}, {pub_date})

Transkript:
{text}

Antwort als JSON:
{{
    "summary": "2-3 Sätze Zusammenfassung",
    "topics": ["Thema 1", "Thema 2", ...],
    "quotes": [
        {{"text": "Zitat", "speaker": "Felix" oder "Tommi", "context": "kurzer Kontext"}}
    ]
}}"""


def build_transcript_excerpt(transcript: dict, max_chars: int = MAX_EXCERPT_CHARS) -> str:
    """Build a representative excerpt from beginning, middle, and end."""
    segments = transcript.get("segments", [])
    if not segments:
        return transcript.get("text", "")[:max_chars]

    total = len(segments)
    third = total // 3

    # Take from all three sections
    selected = (
        segments[: third]
        + segments[third: 2 * third]
        + segments[2 * third:]
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


def estimate_tokens(text: str) -> int:
    """Rough token estimate for German text (~2.8 chars/token)."""
    return len(text) // 3 + 50  # +50 for overhead


def list_transcript_files() -> list[Path]:
    """List all valid transcript JSON files, sorted by episode number."""
    files = []
    for path in sorted(TRANSCRIPTS_DIR.glob("*.json")):
        if any(x in path.name for x in [".chunks.", ".summary.", ".embeddings.", "topics.", "metadata.", "index."]):
            continue
        files.append(path)
    return files


def load_existing_results() -> dict:
    """Load previously extracted results."""
    if OUTPUT_FILE.exists():
        return json.loads(OUTPUT_FILE.read_text())
    return {}


def save_results(results: dict) -> None:
    """Save results atomically."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = OUTPUT_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    tmp.rename(OUTPUT_FILE)


def extract_single(
    client: OpenAI,
    transcript_path: Path,
    *,
    dry_run: bool = False,
) -> tuple[str, dict | None, dict]:
    """Extract topics and summary from a single episode.

    Returns (glt_id, result_or_None, usage_stats).
    """
    transcript = json.loads(transcript_path.read_text())
    meta = transcript.get("meta", {})
    glt_id = transcript_path.stem
    title = meta.get("title", glt_id)
    episode_number = meta.get("episode_number", "?")
    pub_date = meta.get("pub_date", "unbekannt")

    excerpt = build_transcript_excerpt(transcript)
    prompt = EXTRACTION_PROMPT.format(
        title=title,
        episode_number=episode_number,
        pub_date=pub_date,
        text=excerpt,
    )

    input_tokens = estimate_tokens(SYSTEM_PROMPT + prompt)
    output_tokens_est = 500  # typical structured response

    stats = {
        "input_tokens": input_tokens,
        "output_tokens_est": output_tokens_est,
        "title": title,
        "episode_number": episode_number,
    }

    if dry_run:
        return glt_id, None, stats

    start = time.time()

    response = client.beta.chat.completions.parse(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        response_format=EpisodeExtraction,
        temperature=0.3,
    )

    elapsed = time.time() - start
    usage = response.usage

    stats["input_tokens"] = usage.prompt_tokens
    stats["output_tokens"] = usage.completion_tokens
    stats["elapsed"] = elapsed

    parsed = response.choices[0].message.parsed
    if parsed is None:
        console.print(f"[red]✗ {glt_id} — model refused or failed to parse[/red]")
        return glt_id, None, stats

    result_data = {
        "glt_id": glt_id,
        "title": title,
        "episode_number": episode_number,
        "pub_date": pub_date,
        "summary": parsed.summary,
        "topics": parsed.topics,
        "quotes": [q.model_dump() for q in parsed.quotes],
        "model": MODEL,
        "input_tokens": usage.prompt_tokens,
        "output_tokens": usage.completion_tokens,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }

    console.print(
        f"[green]✓[/green] #{episode_number} {title} — "
        f"{len(parsed.topics)} topics, "
        f"{usage.prompt_tokens}+{usage.completion_tokens} tokens, "
        f"{elapsed:.1f}s"
    )

    return glt_id, result_data, stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract topics from transcripts using GPT-5.4")
    parser.add_argument("--dry-run", action="store_true", help="Estimate cost without calling API")
    parser.add_argument("--resume", action="store_true", help="Skip already-processed episodes")
    parser.add_argument("--force", action="store_true", help="Re-process all episodes")
    parser.add_argument("--episode", type=int, help="Process single episode by number")
    parser.add_argument("--limit", type=int, help="Process max N episodes")
    args = parser.parse_args()

    transcript_files = list_transcript_files()
    console.print(f"Found [bold]{len(transcript_files)}[/bold] transcripts")

    # Load existing or start fresh
    if args.force:
        results = {}
    else:
        results = load_existing_results()

    # Filter to target episodes
    if args.episode:
        transcript_files = [
            f for f in transcript_files
            if f.stem.startswith(f"episode_{args.episode:03d}_")
        ]
        if not transcript_files:
            console.print(f"[red]Episode {args.episode} not found[/red]")
            sys.exit(1)

    if args.resume:
        transcript_files = [f for f in transcript_files if f.stem not in results]
        console.print(f"[dim]{len(results)} already done, {len(transcript_files)} remaining[/dim]")

    if args.limit:
        transcript_files = transcript_files[: args.limit]

    if not transcript_files:
        console.print("[yellow]Nothing to process[/yellow]")
        return

    # Dry run: estimate costs
    if args.dry_run:
        total_input = 0
        total_output = 0
        for path in transcript_files:
            _, _, stats = extract_single(None, path, dry_run=True)
            total_input += stats["input_tokens"]
            total_output += stats["output_tokens_est"]

        input_cost = total_input / 1_000_000 * 2.50
        output_cost = total_output / 1_000_000 * 15.00
        total_cost = input_cost + output_cost

        console.print(f"\n[bold]Cost Estimate ({MODEL}):[/bold]")
        console.print(f"  Episodes:      {len(transcript_files)}")
        console.print(f"  Input tokens:  {total_input:,} (${input_cost:.2f})")
        console.print(f"  Output tokens: {total_output:,} (${output_cost:.2f})")
        console.print(f"  [bold]Total:       ${total_cost:.2f}[/bold]")
        return

    # Actual processing
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        console.print("[red]Set OPENAI_API_KEY environment variable[/red]")
        sys.exit(1)

    client = OpenAI(api_key=api_key, http_client=httpx.Client(verify=False))

    total_input_tokens = 0
    total_output_tokens = 0
    processed = 0
    errors = 0

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Extracting topics...", total=len(transcript_files))

        for path in transcript_files:
            glt_id, result, stats = extract_single(client, path)

            if result:
                results[glt_id] = result
                save_results(results)  # save after each episode for resume safety
                processed += 1
                total_input_tokens += stats.get("input_tokens", 0)
                total_output_tokens += stats.get("output_tokens", 0)
            else:
                errors += 1

            progress.advance(task)

            # Brief pause to respect rate limits
            time.sleep(0.2)

    # Final cost summary
    input_cost = total_input_tokens / 1_000_000 * 2.50
    output_cost = total_output_tokens / 1_000_000 * 15.00
    total_cost = input_cost + output_cost

    console.print(f"\n[bold]Done![/bold]")
    console.print(f"  Processed: {processed}, Errors: {errors}")
    console.print(f"  Tokens:    {total_input_tokens:,} in + {total_output_tokens:,} out")
    console.print(f"  Cost:      ${total_cost:.2f}")
    console.print(f"  Saved to:  {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
