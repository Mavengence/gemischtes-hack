# Gemischtes Hack — Topic Universe

Interactive knowledge graph for exploring topics and episodes of the
**Gemischtes Hack** podcast by Felix Lobrecht & Tommi Schmitt.

Browse 120 topic clusters extracted from 351 episodes, drill into episodes,
and discover connections through shared themes.

![Cluster Overview](docs/images/cluster-overview.png)

## Features

- **2-level exploration**: 120 topic clusters → drill into episodes
- **Episode similarity**: Episodes connected by shared sub-topics within each cluster
- **Side panel**: Gradient hero header, topic tags, related episodes
- **Search**: Instant search across topics and episodes
- **Zoom/pan/drag**: Full D3.js force-directed graph interaction
- **Warm light design**: Lora serif + Nunito sans-serif, Instagram-gradient accents

| | |
|---|---|
| ![Episode Drill-Down](docs/images/episode-drilldown.png) | ![Episode Panel](docs/images/episode-panel.png) |

## Quick Start

```bash
cd knowledge-graph

# 1. Install dependencies
pip install -r requirements.txt

# 2. Set your OpenAI API key
export OPENAI_API_KEY="sk-..."

# 3. Extract topics from transcripts (dry-run first to see cost)
python extract_topics.py --dry-run
python extract_topics.py              # ~$5.50, takes ~15 min

# 4. Build the graph
python build_graph.py --export-site   # ~$0.10

# 5. View it
python serve.py
# → Open http://localhost:8080
```

## Pipeline

```
transcripts/*.json
        |
        v
  extract_topics.py     GPT-5.4: summary + topics per episode
        |
        v
  data/episode_topics.json
        |
        v
  build_graph.py        Embed topics → k-means clustering (120 clusters)
        |               → GPT naming → similarity edges → graph.json
        v
  data/graph.json  ──→  site/graph.json
        |
        v
  site/index.html       D3.js 2-level force-directed graph
```

## Cost Estimate

| Step | Model | Cost |
|------|-------|------|
| Topic extraction (351 episodes) | GPT-5.4 | ~$5.35 |
| Cluster naming (120 clusters) | GPT-5.4 | ~$0.10 |
| Topic embeddings | text-embedding-3-large | ~$0.001 |
| **Total** | | **~$5.50** |

Use `--dry-run` to get an exact estimate before spending anything.

## Commands

### extract_topics.py

```bash
python extract_topics.py --dry-run          # estimate cost
python extract_topics.py                     # process all
python extract_topics.py --resume            # continue after interruption
python extract_topics.py --episode 42        # single episode
python extract_topics.py --limit 5           # first 5 unprocessed
python extract_topics.py --force             # re-process all
```

### build_graph.py

```bash
python build_graph.py                        # full pipeline
python build_graph.py --skip-normalize       # skip GPT cluster naming (uses cached)
python build_graph.py --clusters 120         # target number of k-means clusters
python build_graph.py --similarity 0.85      # stricter inter-cluster similarity
python build_graph.py --export-site          # copy graph.json → site/
```

### serve.py

```bash
python serve.py             # default port 8080
PORT=3000 python serve.py   # custom port
```

## Data Files

| File | Description |
|------|-------------|
| `data/episode_topics.json` | Raw extraction output (per-episode topics + summaries) |
| `data/topic_normalization.json` | Canonical label mapping from GPT |
| `data/cluster_names.json` | GPT-generated names for 120 k-means clusters |
| `data/graph.json` | Full graph data (nodes, edges, episodes, search index) |
| `data/raw_topic_embeddings.npz` | **Not in repo** — 3001 × 3072 embedding matrix |
| `data/canonical_topic_embeddings.npz` | **Not in repo** — canonical embedding matrix |
| `site/graph.json` | Copy of graph.json served by the frontend |

> **Note on embeddings:** The `.npz` embedding files (~56 MB) are excluded from the
> repository. They are needed to re-run clustering from scratch. If you need them,
> contact [@Mavengence](https://github.com/Mavengence). Alternatively, re-generate
> them by running `build_graph.py` (requires an OpenAI API key for embedding).

## Deployment

The `site/` directory is fully static — deploy it anywhere:

```bash
# GitHub Pages: point to knowledge-graph/site/
# Netlify/Vercel: set build output to knowledge-graph/site/
# Or serve locally: python serve.py
```
