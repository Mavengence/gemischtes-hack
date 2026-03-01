"""Generate embeddings for transcript chunks using multilingual-e5-small."""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import TYPE_CHECKING, Any

from rich.console import Console
from rich.progress import Progress

from scripts.config import EMBEDDING_DIM, EMBEDDING_MODEL, TRANSCRIPTS_DIR, load_metadata

if TYPE_CHECKING:
    import numpy as np
    from sentence_transformers import SentenceTransformer

console = Console()

# e5 models require prefixes
PASSAGE_PREFIX = "passage: "
QUERY_PREFIX = "query: "


def load_chunks(glt_id: str) -> dict | None:
    """Load chunked transcript file."""
    path = TRANSCRIPTS_DIR / f"{glt_id}.chunks.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def embed_chunks(chunks: list[dict], model: SentenceTransformer) -> np.ndarray:
    """Embed chunk texts with passage prefix for e5 model."""
    texts = [PASSAGE_PREFIX + chunk["text"] for chunk in chunks]
    embeddings = model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
    return embeddings


def embed_episode(
    glt_id: str,
    model: Any,
    *,
    dry_run: bool = False,
    force: bool = False,
) -> int:
    """Embed all chunks for a single episode. Returns number of chunks embedded."""
    output_path = TRANSCRIPTS_DIR / f"{glt_id}.embeddings.npz"

    if output_path.exists() and not force:
        console.print(f"[dim]{glt_id} — already embedded, skipping (use --force)[/dim]")
        return 0

    data = load_chunks(glt_id)
    if not data:
        console.print(f"[yellow]{glt_id} — no chunks found, run chunk.py first[/yellow]")
        return 0

    chunks = data["chunks"]
    if not chunks:
        console.print(f"[yellow]{glt_id} — empty chunks[/yellow]")
        return 0

    if dry_run:
        console.print(f"[cyan]{glt_id}[/cyan] — {len(chunks)} chunks to embed")
        return len(chunks)

    import numpy as np

    start = time.time()
    embeddings = embed_chunks(chunks, model)
    elapsed = time.time() - start

    # Save as compressed numpy
    np.savez_compressed(output_path, embeddings=embeddings)

    console.print(
        f"[green]✓[/green] {glt_id} — {len(chunks)} chunks, "
        f"{embeddings.shape[1]}d, {elapsed:.1f}s → {output_path.name}"
    )
    return len(chunks)


def main() -> None:
    from sentence_transformers import SentenceTransformer

    parser = argparse.ArgumentParser(description="Generate embeddings for transcript chunks")
    parser.add_argument("--episode", type=int, help="Process single episode by number")
    parser.add_argument("--glt-id", type=str, help="Process single episode by GLT ID")
    parser.add_argument("--dry-run", action="store_true", help="Preview without processing")
    parser.add_argument("--force", action="store_true", help="Re-embed even if exists")
    args = parser.parse_args()

    if not args.dry_run:
        console.print(f"[bold]Loading embedding model: {EMBEDDING_MODEL}[/bold]")
        model = SentenceTransformer(EMBEDDING_MODEL)
        # Verify dimension
        test = model.encode(["test"], normalize_embeddings=True)
        assert test.shape[1] == EMBEDDING_DIM, f"Expected {EMBEDDING_DIM}d, got {test.shape[1]}d"
    else:
        model = None

    metadata = load_metadata()

    if args.glt_id:
        embed_episode(args.glt_id, model, dry_run=args.dry_run, force=args.force)
        return

    if args.episode:
        episode = next((ep for ep in metadata if ep.number == args.episode), None)
        if not episode:
            console.print(f"[red]Episode {args.episode} not found[/red]")
            sys.exit(1)
        embed_episode(episode.glt_id, model, dry_run=args.dry_run, force=args.force)
        return

    # Process all chunked episodes
    total = 0
    chunk_files = sorted(TRANSCRIPTS_DIR.glob("*.chunks.json"))

    with Progress() as progress:
        task = progress.add_task("Embedding...", total=len(chunk_files))
        for path in chunk_files:
            glt_id = path.stem.replace(".chunks", "")
            count = embed_episode(glt_id, model, dry_run=args.dry_run, force=args.force)
            total += count
            progress.advance(task)

    console.print(f"\n[bold]Embedded {total} total chunks[/bold]")


if __name__ == "__main__":
    main()
