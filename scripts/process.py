"""Orchestrator: chunk → embed → topics → summarize → upload."""

import argparse
import sys

from rich.console import Console
from rich.panel import Panel

from scripts.config import TRANSCRIPTS_DIR, load_metadata

console = Console()


def run_chunk(glt_ids: list[str], *, dry_run: bool = False) -> None:
    """Chunk all specified episodes."""
    from scripts.chunk import chunk_episode

    console.print(Panel("[bold]Step 1/5: Chunking transcripts[/bold]"))
    for glt_id in glt_ids:
        chunk_episode(glt_id, dry_run=dry_run)


def run_embed(glt_ids: list[str], *, dry_run: bool = False, force: bool = False) -> None:
    """Embed all specified episodes."""
    from scripts.embed import embed_episode

    console.print(Panel("[bold]Step 2/5: Generating embeddings[/bold]"))

    if not dry_run:
        from sentence_transformers import SentenceTransformer

        from scripts.config import EMBEDDING_MODEL

        console.print(f"Loading model: {EMBEDDING_MODEL}")
        model = SentenceTransformer(EMBEDDING_MODEL)
    else:
        model = None

    for glt_id in glt_ids:
        embed_episode(glt_id, model, dry_run=dry_run, force=force)


def run_topics(*, dry_run: bool = False) -> None:
    """Extract topics from all embedded chunks."""
    console.print(Panel("[bold]Step 3/5: Extracting topics[/bold]"))

    if dry_run:
        console.print("[cyan]Would run BERTopic on all embedded chunks[/cyan]")
        return

    from scripts.topics import extract_topics, load_all_chunks_and_embeddings, save_topics

    texts, chunk_meta, embeddings = load_all_chunks_and_embeddings()
    if len(texts) == 0:
        console.print("[yellow]No embedded chunks found, skipping topics[/yellow]")
        return

    console.print(f"Processing {len(texts)} chunks...")
    topic_model = extract_topics(texts, embeddings)
    save_topics(topic_model, chunk_meta, str(TRANSCRIPTS_DIR / "topics.json"))


def run_summarize(glt_ids: list[str], *, dry_run: bool = False, force: bool = False) -> None:
    """Summarize all specified episodes."""
    from scripts.summarize import summarize_episode

    console.print(Panel("[bold]Step 4/5: Generating summaries[/bold]"))
    for glt_id in glt_ids:
        summarize_episode(glt_id, dry_run=dry_run, force=force)


def run_upload(glt_ids: list[str] | None = None, *, dry_run: bool = False) -> None:
    """Upload everything to Supabase."""
    from scripts.upload import upload_all

    console.print(Panel("[bold]Step 5/5: Uploading to Supabase[/bold]"))
    episode_filter = glt_ids[0] if glt_ids and len(glt_ids) == 1 else None
    upload_all(dry_run=dry_run, episode_filter=episode_filter)


def find_transcribed_glt_ids(episode_filter: int | None = None, glt_filter: str | None = None) -> list[str]:
    """Find all GLT IDs with completed transcripts."""
    if glt_filter:
        return [glt_filter]

    if episode_filter:
        metadata = load_metadata()
        ep = next((e for e in metadata if e.number == episode_filter), None)
        if not ep:
            console.print(f"[red]Episode {episode_filter} not found in metadata[/red]")
            sys.exit(1)
        return [ep.glt_id]

    glt_ids = []
    for path in sorted(TRANSCRIPTS_DIR.glob("*.json")):
        if any(x in path.name for x in [".chunks.", ".summary.", ".embeddings.", "topics.", "metadata."]):
            continue
        glt_ids.append(path.stem)

    return glt_ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the full processing pipeline")
    parser.add_argument("--episode", type=int, help="Process single episode by number")
    parser.add_argument("--glt-id", type=str, help="Process single episode by GLT ID")
    parser.add_argument("--dry-run", action="store_true", help="Preview all steps")
    parser.add_argument("--force", action="store_true", help="Reprocess even if outputs exist")
    parser.add_argument(
        "--skip",
        nargs="+",
        choices=["chunk", "embed", "topics", "summarize", "upload"],
        default=[],
        help="Skip specific steps",
    )
    parser.add_argument("--no-upload", action="store_true", help="Skip the upload step")
    args = parser.parse_args()

    glt_ids = find_transcribed_glt_ids(
        episode_filter=args.episode,
        glt_filter=args.glt_id,
    )

    if not glt_ids:
        console.print("[red]No transcripts found to process[/red]")
        sys.exit(1)

    console.print(f"\n[bold]Processing {len(glt_ids)} episodes[/bold]\n")

    skip = set(args.skip)
    if args.no_upload:
        skip.add("upload")

    if "chunk" not in skip:
        run_chunk(glt_ids, dry_run=args.dry_run)

    if "embed" not in skip:
        run_embed(glt_ids, dry_run=args.dry_run, force=args.force)

    if "topics" not in skip:
        run_topics(dry_run=args.dry_run)

    if "summarize" not in skip:
        run_summarize(glt_ids, dry_run=args.dry_run, force=args.force)

    if "upload" not in skip:
        run_upload(glt_ids, dry_run=args.dry_run)

    console.print("\n[bold green]Pipeline complete![/bold green]")


if __name__ == "__main__":
    main()
