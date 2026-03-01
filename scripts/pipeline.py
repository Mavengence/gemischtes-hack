"""Batch pipeline: download → transcribe → delete MP3s to conserve disk space."""

import argparse
import shutil
import time

from rich.console import Console
from rich.table import Table

from scripts.config import (
    EPISODES_DIR,
    TRANSCRIPTS_DIR,
    EpisodeMeta,
    is_transcribed,
    load_metadata,
)
from scripts.download import download_episode, fetch_feed, save_metadata
from scripts.transcribe import load_diarization_pipeline, transcribe_episode

console = Console()


def get_untranscribed_episodes(episodes: list[EpisodeMeta]) -> list[EpisodeMeta]:
    """Return episodes that don't have transcripts yet, sorted by episode number."""
    return [ep for ep in episodes if not is_transcribed(ep)]


def disk_usage_str() -> str:
    """Return human-readable free disk space."""
    usage = shutil.disk_usage("/")
    free_gb = usage.free / (1024**3)
    return f"{free_gb:.1f} GB free"


def run_pipeline(
    batch_size: int = 20,
    dry_run: bool = False,
    refresh_feed: bool = True,
) -> None:
    """Run the full download → transcribe → delete pipeline in batches."""
    console.print("[bold]Gemischtes Hack Pipeline[/bold]")
    console.print(f"Disk: {disk_usage_str()}")
    console.print()

    # Get episode list
    if refresh_feed:
        episodes = fetch_feed()
        EPISODES_DIR.mkdir(parents=True, exist_ok=True)
        save_metadata(episodes, EPISODES_DIR / "metadata.json")
    else:
        episodes = load_metadata()
        if not episodes:
            console.print("[red]No metadata found. Run with --refresh or download.py --metadata-only.[/red]")
            return

    pending = get_untranscribed_episodes(episodes)
    total_pending = len(pending)

    console.print(f"Total episodes: [bold]{len(episodes)}[/bold]")
    console.print(f"Already transcribed: [bold]{len(episodes) - total_pending}[/bold]")
    console.print(f"Remaining: [bold]{total_pending}[/bold]")

    if total_pending == 0:
        console.print("[green]All episodes are transcribed![/green]")
        return

    total_hours = sum(ep.duration_seconds for ep in pending) / 3600
    console.print(f"Total audio remaining: [bold]{total_hours:.1f}h[/bold]")
    console.print()

    # Load diarization pipeline once
    diarization_pipeline = None
    if not dry_run:
        try:
            diarization_pipeline = load_diarization_pipeline()
        except SystemExit:
            return

    # Process in batches
    batch_num = 0
    total_transcribed = 0
    total_failed = 0
    pipeline_start = time.time()

    while pending:
        batch_num += 1
        batch = pending[:batch_size]
        pending = pending[batch_size:]

        batch_hours = sum(ep.duration_seconds for ep in batch) / 3600
        console.rule(f"[bold]Batch {batch_num}[/bold] — {len(batch)} episodes ({batch_hours:.1f}h)")

        if dry_run:
            table = Table(show_header=True)
            table.add_column("#", style="cyan", width=5)
            table.add_column("Title", style="white")
            table.add_column("Duration", style="dim", width=8)
            for ep in batch:
                dur = f"{ep.duration_seconds // 60} min"
                table.add_row(str(ep.number or "?"), ep.title, dur)
            console.print(table)
            continue

        # Step 1: Download
        console.print("\n[blue]Step 1: Downloading...[/blue]")
        downloaded = []
        for i, ep in enumerate(batch, 1):
            audio_path = EPISODES_DIR / ep.filename
            if audio_path.exists():
                console.print(f"  [{i}/{len(batch)}] Already downloaded: {ep.filename}")
                downloaded.append(ep)
                continue

            console.print(f"  [{i}/{len(batch)}] Episode #{ep.number or '?'}: {ep.title}")
            success = download_episode(ep, EPISODES_DIR)
            if success:
                downloaded.append(ep)
            else:
                console.print(f"  [red]Download failed, skipping[/red]")
                total_failed += 1

        # Step 2: Transcribe
        console.print(f"\n[blue]Step 2: Transcribing {len(downloaded)} episodes...[/blue]")
        transcribed_in_batch = []
        for i, ep in enumerate(downloaded, 1):
            console.print(f"\n  [{i}/{len(downloaded)}] Episode #{ep.number or '?'}: {ep.title}")
            result = transcribe_episode(ep, diarization_pipeline=diarization_pipeline)
            if result:
                transcribed_in_batch.append(ep)
                total_transcribed += 1
            else:
                total_failed += 1

        # Step 3: Delete MP3s to free disk space
        console.print(f"\n[blue]Step 3: Cleaning up MP3s...[/blue]")
        freed = 0
        for ep in transcribed_in_batch:
            audio_path = EPISODES_DIR / ep.filename
            if audio_path.exists():
                size = audio_path.stat().st_size
                audio_path.unlink()
                freed += size
                console.print(f"  Deleted: {ep.filename} ({size / (1024**2):.1f} MB)")

        console.print(f"  Freed: {freed / (1024**3):.2f} GB | {disk_usage_str()}")

    elapsed = time.time() - pipeline_start

    if not dry_run:
        console.print(f"\n{'=' * 60}")
        console.print(f"[bold green]Pipeline complete![/bold green]")
        console.print(f"Transcribed: {total_transcribed} | Failed: {total_failed}")
        console.print(f"Wall time: {elapsed / 3600:.1f}h")
        console.print(f"Disk: {disk_usage_str()}")
    else:
        console.print(f"\n[dim]Dry run complete. {total_pending} episodes would be processed.[/dim]")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Batch pipeline: download → transcribe → delete"
    )
    parser.add_argument("--batch-size", type=int, default=20,
                        help="Episodes per batch (default: 20)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview the batch plan without executing")
    parser.add_argument("--no-refresh", action="store_true",
                        help="Skip RSS feed refresh, use existing metadata")
    args = parser.parse_args()

    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

    run_pipeline(
        batch_size=args.batch_size,
        dry_run=args.dry_run,
        refresh_feed=not args.no_refresh,
    )


if __name__ == "__main__":
    main()
