"""Upload processed data to Supabase (episodes, chunks with embeddings, topics)."""

from __future__ import annotations

import argparse
import json
import os
import sys

from rich.console import Console
from rich.progress import Progress

from scripts.config import TRANSCRIPTS_DIR, load_metadata

console = Console()

BATCH_SIZE = 100


def get_supabase():
    """Create Supabase client from environment variables."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

    if not url or not key:
        console.print("[red]Missing SUPABASE_URL and SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY[/red]")
        console.print("Set them in your environment or .env file")
        sys.exit(1)

    from supabase import create_client

    return create_client(url, key)


def upload_episode(supabase, episode_meta: dict, summary: dict | None) -> int:
    """Upsert a single episode. Returns the episode ID."""
    data = {
        "glt_id": episode_meta["glt_id"],
        "episode_number": episode_meta.get("episode_number") or episode_meta.get("number"),
        "title": episode_meta["title"],
        "pub_date": episode_meta["pub_date"],
        "duration_seconds": episode_meta["duration_seconds"],
        "description": episode_meta.get("description", ""),
    }

    if summary:
        data["summary"] = summary.get("summary", "")
        data["topics_json"] = summary.get("topics", [])
        data["quotes_json"] = summary.get("quotes", [])

    result = (
        supabase.table("episodes")
        .upsert(data, on_conflict="glt_id")
        .execute()
    )
    return result.data[0]["id"]


def upload_chunks(supabase, episode_id: int, glt_id: str) -> int:
    """Upload chunks with embeddings for an episode. Returns chunk count."""
    chunks_path = TRANSCRIPTS_DIR / f"{glt_id}.chunks.json"
    emb_path = TRANSCRIPTS_DIR / f"{glt_id}.embeddings.npz"

    if not chunks_path.exists() or not emb_path.exists():
        return 0

    import numpy as np

    chunks_data = json.loads(chunks_path.read_text())["chunks"]
    embeddings = np.load(emb_path)["embeddings"]

    if len(chunks_data) != len(embeddings):
        console.print(f"[red]{glt_id} — chunk/embedding count mismatch[/red]")
        return 0

    # Delete existing chunks for this episode (idempotent re-upload)
    supabase.table("chunks").delete().eq("episode_id", episode_id).execute()

    # Batch insert
    rows = []
    for i, chunk in enumerate(chunks_data):
        rows.append({
            "episode_id": episode_id,
            "chunk_index": chunk["chunk_index"],
            "text": chunk["text"],
            "start_time": chunk["start_time"],
            "end_time": chunk["end_time"],
            "speakers": chunk["speakers"],
            "embedding": embeddings[i].tolist(),
        })

        if len(rows) >= BATCH_SIZE:
            supabase.table("chunks").insert(rows).execute()
            rows = []

    if rows:
        supabase.table("chunks").insert(rows).execute()

    return len(chunks_data)


def upload_topics(supabase) -> dict[int, int]:
    """Upload topic data. Returns mapping of local topic_id → database topic_id."""
    topics_path = TRANSCRIPTS_DIR / "topics.json"
    if not topics_path.exists():
        console.print("[yellow]No topics.json found, skipping topic upload[/yellow]")
        return {}

    data = json.loads(topics_path.read_text())
    topic_map = {}

    for topic in data.get("topics", []):
        result = (
            supabase.table("topics")
            .upsert(
                {
                    "label": topic["label"],
                    "keywords": topic["keywords"],
                    "chunk_count": topic["count"],
                },
                on_conflict="label",
            )
            .execute()
        )
        topic_map[topic["id"]] = result.data[0]["id"]

    console.print(f"[green]✓[/green] Uploaded {len(topic_map)} topics")
    return topic_map


def upload_episode_topics(
    supabase,
    episode_id: int,
    glt_id: str,
    topic_map: dict[int, int],
    episode_topics_data: dict,
) -> None:
    """Upload episode-topic associations."""
    ep_topics = episode_topics_data.get(glt_id, [])
    if not ep_topics:
        return

    # Delete existing associations
    supabase.table("episode_topics").delete().eq("episode_id", episode_id).execute()

    rows = []
    total_count = sum(t["count"] for t in ep_topics)
    for t in ep_topics:
        db_topic_id = topic_map.get(t["topic_id"])
        if db_topic_id is None:
            continue
        rows.append({
            "episode_id": episode_id,
            "topic_id": db_topic_id,
            "relevance": t["count"] / total_count if total_count > 0 else 0,
        })

    if rows:
        supabase.table("episode_topics").insert(rows).execute()


def upload_all(*, dry_run: bool = False, episode_filter: str | None = None) -> None:
    """Upload all processed data to Supabase."""
    if dry_run:
        console.print("[bold]DRY RUN — no data will be uploaded[/bold]")

    metadata = load_metadata()
    meta_by_glt = {ep.glt_id: ep for ep in metadata}

    # Load topics data
    topics_path = TRANSCRIPTS_DIR / "topics.json"
    episode_topics_data = {}
    if topics_path.exists():
        td = json.loads(topics_path.read_text())
        episode_topics_data = td.get("episode_topics", {})

    # Find episodes with transcripts
    transcript_files = sorted(TRANSCRIPTS_DIR.glob("*.json"))
    glt_ids = []
    for path in transcript_files:
        if any(x in path.name for x in [".chunks.", ".summary.", ".embeddings.", "topics.", "metadata."]):
            continue
        glt_id = path.stem
        if episode_filter and glt_id != episode_filter:
            continue
        glt_ids.append(glt_id)

    console.print(f"Found {len(glt_ids)} episodes to upload")

    if dry_run:
        for glt_id in glt_ids:
            has_chunks = (TRANSCRIPTS_DIR / f"{glt_id}.chunks.json").exists()
            has_emb = (TRANSCRIPTS_DIR / f"{glt_id}.embeddings.npz").exists()
            has_summary = (TRANSCRIPTS_DIR / f"{glt_id}.summary.json").exists()
            ep = meta_by_glt.get(glt_id)
            title = ep.title if ep else "Unknown"
            console.print(
                f"  {glt_id} — {title} "
                f"[{'green' if has_chunks else 'red'}]chunks[/{'green' if has_chunks else 'red'}] "
                f"[{'green' if has_emb else 'red'}]embeddings[/{'green' if has_emb else 'red'}] "
                f"[{'green' if has_summary else 'red'}]summary[/{'green' if has_summary else 'red'}]"
            )
        return

    supabase = get_supabase()

    # Upload topics first
    topic_map = upload_topics(supabase)

    # Upload episodes
    total_chunks = 0
    with Progress() as progress:
        task = progress.add_task("Uploading...", total=len(glt_ids))

        for glt_id in glt_ids:
            ep = meta_by_glt.get(glt_id)
            if not ep:
                console.print(f"[yellow]{glt_id} — not in metadata, skipping[/yellow]")
                progress.advance(task)
                continue

            # Load summary if available
            summary_path = TRANSCRIPTS_DIR / f"{glt_id}.summary.json"
            summary = json.loads(summary_path.read_text()) if summary_path.exists() else None

            # Upload episode
            episode_id = upload_episode(supabase, ep.model_dump(), summary)

            # Upload chunks with embeddings
            chunk_count = upload_chunks(supabase, episode_id, glt_id)
            total_chunks += chunk_count

            # Upload episode-topic associations
            if topic_map and episode_topics_data:
                upload_episode_topics(supabase, episode_id, glt_id, topic_map, episode_topics_data)

            progress.advance(task)

    console.print(f"\n[bold]Uploaded {len(glt_ids)} episodes, {total_chunks} chunks[/bold]")


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload processed data to Supabase")
    parser.add_argument("--episode", type=int, help="Upload single episode by number")
    parser.add_argument("--glt-id", type=str, help="Upload single episode by GLT ID")
    parser.add_argument("--dry-run", action="store_true", help="Preview without uploading")
    args = parser.parse_args()

    episode_filter = None
    if args.glt_id:
        episode_filter = args.glt_id
    elif args.episode:
        metadata = load_metadata()
        ep = next((e for e in metadata if e.number == args.episode), None)
        if not ep:
            console.print(f"[red]Episode {args.episode} not found[/red]")
            sys.exit(1)
        episode_filter = ep.glt_id

    upload_all(dry_run=args.dry_run, episode_filter=episode_filter)


if __name__ == "__main__":
    main()
