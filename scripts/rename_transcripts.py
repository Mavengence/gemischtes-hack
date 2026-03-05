"""Rename transcripts from GLT IDs to human-readable filenames.

Numbered episodes: episode_{num:03d}_{slug}.json
Specials:         special_{slug}.json

Usage:
    python -m scripts.rename_transcripts           # execute renames
    python -m scripts.rename_transcripts --dry-run # preview only
"""

import argparse
import json
import os
import re

TRANSCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "transcripts")
INDEX_FILE = os.path.join(TRANSCRIPTS_DIR, "index.json")

UMLAUT_MAP = [
    ("ä", "ae"), ("ö", "oe"), ("ü", "ue"),
    ("Ä", "ae"), ("Ö", "oe"), ("Ü", "ue"),
    ("ß", "ss"),
]


def make_slug(title: str) -> str:
    s = re.sub(r"^#\d+\s+", "", title)
    for src, dst in UMLAUT_MAP:
        s = s.replace(src, dst)
    s = re.sub(r"[^a-z0-9]+", "_", s.lower())
    s = s.strip("_")
    return s[:60]


def new_filename(episode_number, title: str, glt_id: str, seen_slugs: set) -> str:
    slug = make_slug(title)
    if episode_number is not None:
        base = f"episode_{episode_number:03d}_{slug}"
    else:
        base = f"special_{slug}"

    candidate = base
    if candidate in seen_slugs:
        suffix = glt_id[-8:] if len(glt_id) >= 8 else glt_id
        candidate = f"{base}_{suffix}"

    seen_slugs.add(candidate)
    return f"{candidate}.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Print changes without executing")
    args = parser.parse_args()

    with open(INDEX_FILE, encoding="utf-8") as f:
        index = json.load(f)

    episodes = index["episodes"]
    seen_slugs: set = set()
    renames = []

    for ep in episodes:
        old_name = ep["filename"]
        old_path = os.path.join(TRANSCRIPTS_DIR, old_name)

        num = ep["episode_number"]
        glt_id = ep.get("glt_id", old_name.replace(".json", ""))
        new_name = new_filename(num, ep["title"], glt_id, seen_slugs)
        new_path = os.path.join(TRANSCRIPTS_DIR, new_name)

        if old_name == new_name:
            continue

        renames.append((ep, old_path, new_path, old_name, new_name))

    print(f"{'DRY RUN — ' if args.dry_run else ''}Renaming {len(renames)} files ({len(episodes) - len(renames)} already up to date)")

    renamed = 0
    skipped = 0

    for ep, old_path, new_path, old_name, new_name in renames:
        print(f"  {old_name}  →  {new_name}")

        if args.dry_run:
            continue

        if not os.path.exists(old_path):
            print(f"    SKIP (file not found)")
            skipped += 1
            continue

        # Update meta.filename inside the JSON file
        with open(old_path, encoding="utf-8") as f:
            data = json.load(f)
        data.setdefault("meta", {})["filename"] = new_name
        with open(old_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        os.rename(old_path, new_path)
        ep["filename"] = new_name
        renamed += 1

    if not args.dry_run:
        index["episodes"] = episodes
        with open(INDEX_FILE, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False, indent=2)
        print(f"\nDone. {renamed} renamed, {skipped} skipped. index.json updated.")
    else:
        print(f"\nDry run complete. {len(renames)} renames would be executed.")


if __name__ == "__main__":
    main()
