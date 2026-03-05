"""Build a master index of all transcribed episodes.

Reads all transcripts/GLT*.json files and outputs transcripts/index.json
with episode number, title, GLT ID, pub date, duration — sorted by episode number.

Usage:
    python -m scripts.build_index
"""

import json
import glob
import os
from datetime import datetime, timezone


TRANSCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "transcripts")
OUTPUT_FILE = os.path.join(TRANSCRIPTS_DIR, "index.json")


def build_index():
    pattern = os.path.join(TRANSCRIPTS_DIR, "GLT*.json")
    files = [f for f in glob.glob(pattern) if not f.endswith(".chunks.json")]

    episodes = []
    skipped = 0

    for filepath in files:
        filename = os.path.basename(filepath)
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"  SKIP {filename}: {e}")
            skipped += 1
            continue

        meta = data.get("meta", {})
        episodes.append({
            "episode_number": meta.get("episode_number"),
            "title": meta.get("title", ""),
            "glt_id": meta.get("glt_id", filename.replace(".json", "")),
            "filename": filename,
            "pub_date": meta.get("pub_date", ""),
            "duration_seconds": meta.get("duration_seconds"),
            "has_diarization": meta.get("has_diarization", False),
        })

    # Sort: numbered episodes first (ascending), then specials (None) at end
    episodes.sort(key=lambda e: (e["episode_number"] is None, e["episode_number"] or 0))

    index = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_episodes": len(episodes),
        "episodes": episodes,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"Written {OUTPUT_FILE}")
    print(f"  {len(episodes)} episodes indexed")
    if skipped:
        print(f"  {skipped} files skipped (parse errors)")

    # Quick sanity check
    numbered = [e for e in episodes if e["episode_number"] is not None]
    specials = [e for e in episodes if e["episode_number"] is None]
    print(f"  {len(numbered)} numbered episodes, {len(specials)} specials")


if __name__ == "__main__":
    build_index()
