"""Extract topics from transcript chunks using BERTopic."""

from __future__ import annotations

import argparse
import json
from typing import TYPE_CHECKING, Any

from rich.console import Console

from scripts.config import TRANSCRIPTS_DIR

if TYPE_CHECKING:
    import numpy as np
    from bertopic import BERTopic

console = Console()


def load_all_chunks_and_embeddings() -> tuple[list[str], list[dict], Any]:
    """Load all chunk texts and their pre-computed embeddings."""
    import numpy as np

    all_texts = []
    all_chunk_meta = []
    all_embeddings = []

    chunk_files = sorted(TRANSCRIPTS_DIR.glob("*.chunks.json"))
    for path in chunk_files:
        glt_id = path.stem.replace(".chunks", "")
        emb_path = TRANSCRIPTS_DIR / f"{glt_id}.embeddings.npz"

        if not emb_path.exists():
            console.print(f"[yellow]Skipping {glt_id} — no embeddings[/yellow]")
            continue

        data = json.loads(path.read_text())
        embeddings = np.load(emb_path)["embeddings"]

        if len(data["chunks"]) != len(embeddings):
            console.print(f"[red]{glt_id} — chunk/embedding count mismatch[/red]")
            continue

        for i, chunk in enumerate(data["chunks"]):
            all_texts.append(chunk["text"])
            all_chunk_meta.append({
                "glt_id": glt_id,
                "chunk_index": chunk["chunk_index"],
                "episode_title": data.get("meta", {}).get("title", ""),
            })
            all_embeddings.append(embeddings[i])

    return all_texts, all_chunk_meta, np.array(all_embeddings)


def extract_topics(
    texts: list[str],
    embeddings: Any,
    *,
    min_topic_size: int = 15,
    nr_topics: int | None = None,
) -> BERTopic:
    """Run BERTopic on pre-computed embeddings."""
    from bertopic import BERTopic
    from bertopic.representation import KeyBERTInspired
    from umap import UMAP

    # UMAP for dimensionality reduction
    umap_model = UMAP(
        n_neighbors=15,
        n_components=5,
        min_dist=0.0,
        metric="cosine",
        random_state=42,
    )

    # KeyBERT-inspired representation for better topic labels
    representation_model = KeyBERTInspired()

    topic_model = BERTopic(
        umap_model=umap_model,
        min_topic_size=min_topic_size,
        nr_topics=nr_topics,
        representation_model=representation_model,
        language="multilingual",
        verbose=True,
    )

    topics, probs = topic_model.fit_transform(texts, embeddings)
    return topic_model


def save_topics(
    topic_model: Any,
    chunk_meta: list[dict],
    output_path: str,
) -> None:
    """Save topic assignments and labels to JSON."""
    topic_info = topic_model.get_topic_info()
    topics = topic_model.topics_

    # Build topic data
    topic_data = []
    for _, row in topic_info.iterrows():
        topic_id = row["Topic"]
        if topic_id == -1:
            continue  # Skip outlier topic
        words = topic_model.get_topic(topic_id)
        topic_data.append({
            "id": int(topic_id),
            "label": row["Name"],
            "keywords": [w for w, _ in words[:10]],
            "count": int(row["Count"]),
        })

    # Build per-chunk assignments
    chunk_topics = []
    for i, topic_id in enumerate(topics):
        chunk_topics.append({
            **chunk_meta[i],
            "topic_id": int(topic_id),
        })

    # Build episode-topic mapping
    episode_topics: dict[str, dict[int, int]] = {}
    for ct in chunk_topics:
        glt_id = ct["glt_id"]
        tid = ct["topic_id"]
        if tid == -1:
            continue
        if glt_id not in episode_topics:
            episode_topics[glt_id] = {}
        episode_topics[glt_id][tid] = episode_topics[glt_id].get(tid, 0) + 1

    output = {
        "topics": topic_data,
        "chunk_topics": chunk_topics,
        "episode_topics": {
            glt_id: [
                {"topic_id": tid, "count": count}
                for tid, count in sorted(counts.items(), key=lambda x: -x[1])
            ]
            for glt_id, counts in episode_topics.items()
        },
    }

    with open(output_path, "w") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    console.print(f"[green]✓[/green] Saved {len(topic_data)} topics → {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract topics with BERTopic")
    parser.add_argument("--min-topic-size", type=int, default=15, help="Min chunks per topic")
    parser.add_argument("--nr-topics", type=int, default=None, help="Target number of topics")
    parser.add_argument("--dry-run", action="store_true", help="Preview data stats only")
    parser.add_argument(
        "--output",
        type=str,
        default=str(TRANSCRIPTS_DIR / "topics.json"),
        help="Output path for topic data",
    )
    args = parser.parse_args()

    console.print("[bold]Loading chunks and embeddings...[/bold]")
    texts, chunk_meta, embeddings = load_all_chunks_and_embeddings()

    if len(texts) == 0:
        console.print("[red]No chunks with embeddings found. Run chunk.py and embed.py first.[/red]")
        return

    console.print(f"Loaded {len(texts)} chunks from {len(set(m['glt_id'] for m in chunk_meta))} episodes")
    console.print(f"Embedding shape: {embeddings.shape}")

    if args.dry_run:
        return

    console.print("\n[bold]Running BERTopic...[/bold]")
    topic_model = extract_topics(
        texts,
        embeddings,
        min_topic_size=args.min_topic_size,
        nr_topics=args.nr_topics,
    )

    # Print topic summary
    topic_info = topic_model.get_topic_info()
    console.print(f"\n[bold]Found {len(topic_info) - 1} topics[/bold] (excluding outliers)")
    for _, row in topic_info.head(20).iterrows():
        if row["Topic"] == -1:
            console.print(f"  [dim]Outliers: {row['Count']} chunks[/dim]")
        else:
            console.print(f"  Topic {row['Topic']}: {row['Name']} ({row['Count']} chunks)")

    save_topics(topic_model, chunk_meta, args.output)


if __name__ == "__main__":
    main()
