"""Build a 2-level knowledge graph from extracted topics.

Level 1 (default view): ~80-150 super-topic clusters, connected by similarity
Level 2 (drill-down): click a super-topic → see its sub-topics + episodes

Pipeline:
  1. Load raw topic embeddings (cached from previous run)
  2. K-means cluster ~3000 raw topics into ~120 super-clusters
  3. GPT names each super-cluster with a short canonical label
  4. Build 2-level graph JSON for D3 frontend

Usage:
    python build_graph.py                       # full pipeline
    python build_graph.py --clusters 100        # target number of super-topics
    python build_graph.py --skip-normalize      # skip GPT naming
    python build_graph.py --export-site         # copy graph.json into site/
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import httpx
import numpy as np
from openai import OpenAI
from rich.console import Console

console = Console()

DATA_DIR = Path(__file__).resolve().parent / "data"
SITE_DIR = Path(__file__).resolve().parent / "site"
EPISODE_TOPICS_FILE = DATA_DIR / "episode_topics.json"
GRAPH_FILE = DATA_DIR / "graph.json"

EMBEDDING_MODEL = "text-embedding-3-large"
GPT_MODEL = "gpt-5.4"
DEFAULT_NUM_CLUSTERS = 120

RAW_EMBEDDINGS_FILE = DATA_DIR / "raw_topic_embeddings.npz"
CLUSTER_NAMES_FILE = DATA_DIR / "cluster_names.json"


# ── Data loading ──

def load_episode_topics() -> dict:
    if not EPISODE_TOPICS_FILE.exists():
        console.print(f"[red]{EPISODE_TOPICS_FILE} not found. Run extract_topics.py first.[/red]")
        sys.exit(1)
    return json.loads(EPISODE_TOPICS_FILE.read_text())


def collect_raw_topics(episodes: dict) -> tuple[list[str], dict[str, list[str]]]:
    topic_to_episodes: dict[str, list[str]] = defaultdict(list)
    for glt_id, ep in episodes.items():
        for topic in ep.get("topics", []):
            label = topic.strip()
            if label:
                topic_to_episodes[label].append(glt_id)
    unique_labels = sorted(topic_to_episodes.keys())
    console.print(f"Collected [bold]{len(unique_labels)}[/bold] unique raw topic labels")
    return unique_labels, dict(topic_to_episodes)


# ── Embeddings (with cache) ──

def load_cached_embeddings(path: Path, labels: list[str]) -> np.ndarray | None:
    if not path.exists():
        return None
    data = np.load(path, allow_pickle=True)
    cached_labels = list(data["labels"])
    if cached_labels == labels:
        console.print(f"[dim]Loaded cached embeddings from {path}[/dim]")
        return data["embeddings"].astype(np.float32)
    console.print(f"[yellow]Cache miss ({len(cached_labels)} → {len(labels)} labels)[/yellow]")
    return None


def save_embeddings(path: Path, labels: list[str], embeddings: np.ndarray) -> None:
    np.savez_compressed(path, labels=np.array(labels, dtype=object), embeddings=embeddings)
    console.print(f"[dim]Saved embeddings → {path} {embeddings.shape}[/dim]")


def get_embeddings(client: OpenAI, labels: list[str], cache_path: Path | None = None) -> np.ndarray:
    if cache_path:
        cached = load_cached_embeddings(cache_path, labels)
        if cached is not None:
            return cached

    all_emb = []
    for i in range(0, len(labels), 2048):
        batch = labels[i: i + 2048]
        resp = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        all_emb.extend([item.embedding for item in resp.data])

    embeddings = np.array(all_emb, dtype=np.float32)
    console.print(f"Embedded {len(labels)} labels → {embeddings.shape}")
    if cache_path:
        save_embeddings(cache_path, labels, embeddings)
    return embeddings


# ── K-means (numpy only, no sklearn) ──

def _normalize(vecs: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return vecs / norms


def kmeans_cosine(embeddings: np.ndarray, k: int, max_iter: int = 50) -> np.ndarray:
    """K-means on L2-normalized embeddings (cosine distance). Returns assignments."""
    normed = _normalize(embeddings)
    n = normed.shape[0]

    # k-means++ init
    rng = np.random.default_rng(42)
    centers = [normed[rng.integers(n)]]
    for _ in range(1, k):
        dists = 1.0 - normed @ np.array(centers).T  # (n, len(centers))
        min_dists = np.clip(dists.min(axis=1), 0, None)  # clamp negatives from float precision
        total = min_dists.sum()
        probs = min_dists / total if total > 0 else np.ones(n) / n
        centers.append(normed[rng.choice(n, p=probs)])
    centroids = _normalize(np.array(centers, dtype=np.float32))

    assignments = np.zeros(n, dtype=np.int32)
    for iteration in range(max_iter):
        sims = normed @ centroids.T  # (n, k)
        new_assignments = sims.argmax(axis=1).astype(np.int32)
        if np.array_equal(new_assignments, assignments) and iteration > 0:
            break
        assignments = new_assignments
        for c in range(k):
            mask = assignments == c
            if mask.any():
                centroids[c] = _normalize(normed[mask].mean(axis=0, keepdims=True))[0]

    console.print(f"K-means: {n} topics → [bold]{k}[/bold] clusters ({iteration + 1} iterations)")
    return assignments


# ── Cluster building ──

def build_clusters(
    labels: list[str],
    assignments: np.ndarray,
    topic_to_episodes: dict[str, list[str]],
) -> list[dict]:
    cluster_map: dict[int, list[int]] = defaultdict(list)
    for idx, cid in enumerate(assignments):
        cluster_map[int(cid)].append(idx)

    clusters = []
    for cid in sorted(cluster_map.keys()):
        indices = cluster_map[cid]
        sub_topics = []
        all_episodes: set[str] = set()
        for idx in indices:
            label = labels[idx]
            eps = topic_to_episodes.get(label, [])
            sub_topics.append({"label": label, "episodes": eps, "count": len(eps)})
            all_episodes.update(eps)

        sub_topics.sort(key=lambda x: x["count"], reverse=True)
        clusters.append({
            "id": cid,
            "sub_topics": sub_topics,
            "episodes": all_episodes,
            "total_episode_count": len(all_episodes),
        })

    clusters.sort(key=lambda c: c["total_episode_count"], reverse=True)
    return clusters


# ── GPT naming ──

def name_clusters_gpt(client: OpenAI, clusters: list[dict]) -> list[str]:
    all_names: list[str] = [None] * len(clusters)  # type: ignore
    batch_size = 40
    total_cost = 0.0

    for batch_start in range(0, len(clusters), batch_size):
        batch = clusters[batch_start: batch_start + batch_size]
        descriptions = []
        for i, cluster in enumerate(batch):
            top_labels = [st["label"] for st in cluster["sub_topics"][:10]]
            descriptions.append(f"{batch_start + i}: {json.dumps(top_labels, ensure_ascii=False)}")

        prompt = (
            "Du bist ein Experte für den Podcast 'Gemischtes Hack'.\n"
            "Unten sind Cluster von ähnlichen Podcast-Themen. "
            "Gib jedem Cluster einen kurzen, prägnanten Namen (1-3 Wörter, Deutsch).\n"
            "Der Name soll das übergeordnete Thema zusammenfassen.\n\n"
            "Beispiele:\n"
            '- ["Kiffen", "Gras rauchen", "Joint"] → "Kiffen"\n'
            '- ["Champions League", "Bundesliga", "FC Bayern"] → "Fußball"\n'
            '- ["KI in Comedy", "KI-Kriminalität", "ChatGPT"] → "Künstliche Intelligenz"\n\n'
            "Antworte als JSON-Objekt: {\"names\": [\"Name0\", \"Name1\", ...]}\n\n"
            + "\n".join(descriptions)
        )

        response = client.chat.completions.create(
            model=GPT_MODEL,
            messages=[
                {"role": "system", "content": "Du benennst Themen-Cluster eines deutschen Podcasts. Antworte NUR mit validem JSON."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        usage = response.usage
        total_cost += usage.prompt_tokens / 1_000_000 * 2.50 + usage.completion_tokens / 1_000_000 * 15.00

        try:
            result = json.loads(response.choices[0].message.content)
            names = result.get("names", [])
        except (json.JSONDecodeError, KeyError):
            console.print(f"[yellow]GPT naming failed for batch {batch_start}, using fallback[/yellow]")
            names = []

        for i, cluster in enumerate(batch):
            if i < len(names) and names[i]:
                all_names[batch_start + i] = names[i]
            else:
                all_names[batch_start + i] = cluster["sub_topics"][0]["label"]

    console.print(f"Named {len(clusters)} clusters with GPT (cost: ${total_cost:.3f})")
    return all_names


def name_clusters_simple(clusters: list[dict]) -> list[str]:
    return [c["sub_topics"][0]["label"] for c in clusters]


# ── Graph building ──

def build_graph(
    episodes: dict,
    clusters: list[dict],
    cluster_names: list[str],
    embeddings: np.ndarray,
    labels: list[str],
    similarity_threshold: float = 0.55,
) -> dict:
    """Build 2-level D3 graph JSON.

    Level 1: super-topic nodes + super-topic↔super-topic edges
    Level 2 (embedded in nodes): sub-topics + episodes per super-topic
    """
    label_to_idx = {l: i for i, l in enumerate(labels)}
    normed = _normalize(embeddings)

    # Compute cluster centroids
    centroids = []
    for cluster in clusters:
        indices = [label_to_idx[st["label"]] for st in cluster["sub_topics"] if st["label"] in label_to_idx]
        if indices:
            centroid = normed[indices].mean(axis=0)
            centroid /= np.linalg.norm(centroid) + 1e-9
            centroids.append(centroid)
        else:
            centroids.append(np.zeros(embeddings.shape[1]))

    centroid_matrix = np.array(centroids, dtype=np.float32)
    sim_matrix = centroid_matrix @ centroid_matrix.T

    # Co-occurrence between clusters
    cluster_cooc: Counter = Counter()
    ep_to_clusters: dict[str, set[int]] = defaultdict(set)
    for ci, cluster in enumerate(clusters):
        for ep_id in cluster["episodes"]:
            ep_to_clusters[ep_id].add(ci)

    for ep_id, cset in ep_to_clusters.items():
        clist = sorted(cset)
        for i, c1 in enumerate(clist):
            for c2 in clist[i + 1:]:
                cluster_cooc[(c1, c2)] += 1

    max_cooc = max(cluster_cooc.values()) if cluster_cooc else 1

    # ── Super-topic nodes ──
    topic_nodes = []
    for ci, cluster in enumerate(clusters):
        name = cluster_names[ci]

        sub_topics = []
        for st in cluster["sub_topics"]:
            sub_topics.append({
                "label": st["label"],
                "episode_count": st["count"],
                "episodes": st["episodes"],
            })

        ep_list = []
        for ep_id in sorted(cluster["episodes"]):
            ep = episodes.get(ep_id, {})
            ep_list.append({
                "glt_id": ep_id,
                "title": ep.get("title", ep_id),
                "episode_number": ep.get("episode_number"),
                "pub_date": ep.get("pub_date", ""),
            })
        ep_list.sort(key=lambda x: x.get("episode_number") or 0)

        topic_nodes.append({
            "id": f"cluster:{ci}",
            "type": "cluster",
            "label": name,
            "episode_count": cluster["total_episode_count"],
            "sub_topic_count": len(cluster["sub_topics"]),
            "sub_topics": sub_topics,
            "episodes": ep_list,
        })

    # ── Super-topic edges (similarity + co-occurrence) ──
    topic_edges = []
    for i in range(len(clusters)):
        for j in range(i + 1, len(clusters)):
            sim = float(sim_matrix[i, j])
            cooc = cluster_cooc.get((i, j), 0)
            cooc_norm = min(cooc / max(max_cooc * 0.3, 1), 1.0)
            combined = sim * 0.5 + cooc_norm * 0.5

            if combined >= similarity_threshold:
                topic_edges.append({
                    "source": f"cluster:{i}",
                    "target": f"cluster:{j}",
                    "type": "similarity",
                    "weight": round(combined, 3),
                    "cosine": round(sim, 3),
                    "cooccurrence": cooc,
                })

    # Keep top edges to avoid clutter
    topic_edges.sort(key=lambda e: e["weight"], reverse=True)
    max_edges = len(clusters) * 3
    topic_edges = topic_edges[:max_edges]

    console.print(f"  Super-topic nodes: {len(topic_nodes)}")
    console.print(f"  Super-topic edges: {len(topic_edges)}")

    # ── Search index ──
    search_index = []
    for node in topic_nodes:
        search_index.append({
            "id": node["id"],
            "type": "cluster",
            "label": node["label"],
            "episode_count": node["episode_count"],
            "sub_topics": [st["label"] for st in node["sub_topics"][:5]],
        })
        for st in node["sub_topics"]:
            search_index.append({
                "id": node["id"],
                "type": "sub_topic",
                "label": st["label"],
                "parent_label": node["label"],
                "episode_count": st["episode_count"],
            })
    for glt_id, ep in episodes.items():
        search_index.append({
            "id": f"ep:{glt_id}",
            "type": "episode",
            "label": f"#{ep.get('episode_number', '?')} {ep.get('title', glt_id)}",
            "summary": ep.get("summary", ""),
            "episode_number": ep.get("episode_number"),
            "glt_id": glt_id,
        })

    return {
        "nodes": topic_nodes,
        "edges": topic_edges,
        "episodes": {
            glt_id: {
                "glt_id": glt_id,
                "title": ep.get("title", glt_id),
                "episode_number": ep.get("episode_number"),
                "pub_date": ep.get("pub_date", ""),
                "summary": ep.get("summary", ""),
                "topics": ep.get("topics", []),
            }
            for glt_id, ep in episodes.items()
        },
        "search_index": search_index,
        "meta": {
            "total_episodes": len(episodes),
            "total_clusters": len(topic_nodes),
            "total_sub_topics": sum(n["sub_topic_count"] for n in topic_nodes),
            "total_edges": len(topic_edges),
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        },
    }


# ── Main ──

def main() -> None:
    parser = argparse.ArgumentParser(description="Build 2-level knowledge graph")
    parser.add_argument("--clusters", type=int, default=DEFAULT_NUM_CLUSTERS, help=f"Target number of super-topic clusters (default: {DEFAULT_NUM_CLUSTERS})")
    parser.add_argument("--skip-normalize", action="store_true", help="Skip GPT-based cluster naming")
    parser.add_argument("--similarity", type=float, default=0.55, help="Similarity threshold for super-topic edges")
    parser.add_argument("--export-site", action="store_true", help="Copy graph.json to site/ directory")
    args = parser.parse_args()

    episodes = load_episode_topics()
    console.print(f"Loaded [bold]{len(episodes)}[/bold] episodes")

    labels, topic_to_episodes = collect_raw_topics(episodes)
    if not labels:
        console.print("[red]No topics found[/red]")
        sys.exit(1)

    # Try to load cached embeddings first (no API key needed)
    cached = load_cached_embeddings(RAW_EMBEDDINGS_FILE, labels)

    client = None

    def get_client() -> OpenAI:
        nonlocal client
        if client is not None:
            return client
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            console.print("[red]Set OPENAI_API_KEY environment variable[/red]")
            sys.exit(1)
        client = OpenAI(api_key=api_key, http_client=httpx.Client(verify=False))
        return client

    if cached is not None:
        embeddings = cached
    else:
        embeddings = get_embeddings(get_client(), labels, cache_path=RAW_EMBEDDINGS_FILE)

    # K-means clustering
    n_clusters = min(args.clusters, len(labels))
    assignments = kmeans_cosine(embeddings, n_clusters)

    clusters = build_clusters(labels, assignments, topic_to_episodes)
    console.print(f"Built {len(clusters)} clusters (largest: {clusters[0]['total_episode_count']} episodes)")

    # Name clusters
    if args.skip_normalize:
        cluster_names = name_clusters_simple(clusters)
    else:
        cluster_names = name_clusters_gpt(get_client(), clusters)

    # Save cluster info for debugging
    cluster_data = [
        {"name": cluster_names[i], "sub_topics": [st["label"] for st in c["sub_topics"]], "episode_count": c["total_episode_count"]}
        for i, c in enumerate(clusters)
    ]
    CLUSTER_NAMES_FILE.write_text(json.dumps(cluster_data, ensure_ascii=False, indent=2))
    console.print(f"[dim]Saved cluster info → {CLUSTER_NAMES_FILE}[/dim]")

    # Build graph
    graph = build_graph(
        episodes, clusters, cluster_names,
        embeddings, labels,
        similarity_threshold=args.similarity,
    )

    GRAPH_FILE.write_text(json.dumps(graph, ensure_ascii=False, indent=2))
    console.print(f"\n[bold green]✓ Graph saved to {GRAPH_FILE}[/bold green]")
    console.print(f"  {graph['meta']['total_clusters']} super-topics, "
                  f"{graph['meta']['total_sub_topics']} sub-topics, "
                  f"{graph['meta']['total_edges']} edges")

    if args.export_site:
        site_graph = SITE_DIR / "graph.json"
        SITE_DIR.mkdir(parents=True, exist_ok=True)
        site_graph.write_text(json.dumps(graph, ensure_ascii=False))
        console.print(f"[bold green]✓ Exported to {site_graph}[/bold green]")


if __name__ == "__main__":
    main()
