"""Download all Gemischtes Hack episodes from the Megaphone RSS feed."""

import argparse
import json
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import asdict
from pathlib import Path

from scripts.config import (
    EPISODES_DIR,
    METADATA_FILE,
    RSS_FEED_URL,
    USER_AGENT,
    EpisodeMeta,
)

CHUNK_SIZE = 1024 * 1024  # 1 MB


def parse_episode_number(title: str) -> int | None:
    """Extract episode number from title like '#333 DEUTSCHE WATERGATE'."""
    match = re.match(r"#(\d+)", title)
    return int(match.group(1)) if match else None


def extract_glt_id(url: str) -> str:
    """Extract GLT ID from URL like 'https://traffic.megaphone.fm/GLT3505596872.mp3?...'."""
    match = re.search(r"(GLT\d+)\.mp3", url)
    return match.group(1) if match else ""


def fetch_feed() -> list[EpisodeMeta]:
    """Fetch and parse the RSS feed, returning all episodes."""
    print(f"Fetching RSS feed: {RSS_FEED_URL}")
    req = urllib.request.Request(RSS_FEED_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()

    root = ET.fromstring(data)
    episodes = []

    for item in root.findall(".//item"):
        title = item.find("title").text or "Unknown"
        number = parse_episode_number(title)
        pub_date = item.find("pubDate").text or ""
        guid = item.find("guid").text or ""

        duration_el = item.find("{http://www.itunes.com/dtds/podcast-1.0.dtd}duration")
        duration = int(duration_el.text) if duration_el is not None and duration_el.text else 0

        desc_el = item.find("description")
        description = desc_el.text or "" if desc_el is not None else ""

        enclosure = item.find("enclosure")
        if enclosure is None:
            continue
        audio_url = enclosure.get("url", "")
        if not audio_url:
            continue

        glt_id = extract_glt_id(audio_url)
        filename = f"{glt_id}.mp3" if glt_id else f"unknown_{guid[:10]}.mp3"

        episodes.append(EpisodeMeta(
            number=number,
            title=title,
            pub_date=pub_date,
            duration_seconds=duration,
            audio_url=audio_url,
            guid=guid,
            description=description,
            filename=filename,
            glt_id=glt_id,
        ))

    episodes.sort(key=lambda e: e.number if e.number is not None else 0)
    print(f"Found {len(episodes)} episodes in feed")
    return episodes


def download_episode(episode: EpisodeMeta, episodes_dir: Path) -> bool:
    """Download a single episode. Returns True if downloaded, False if skipped."""
    filepath = episodes_dir / episode.filename
    if filepath.exists():
        return False

    print(f"  Downloading: {episode.title} ...")
    req = urllib.request.Request(episode.audio_url, headers={"User-Agent": USER_AGENT})

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            total_size = int(resp.headers.get("Content-Length", 0))
            downloaded = 0

            with open(filepath, "wb") as f:
                while True:
                    chunk = resp.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)

                    if total_size > 0:
                        pct = downloaded / total_size * 100
                        mb = downloaded / (1024 * 1024)
                        total_mb = total_size / (1024 * 1024)
                        print(f"\r    {mb:.1f}/{total_mb:.1f} MB ({pct:.0f}%)", end="", flush=True)

        print(f"\r    Done: {downloaded / (1024 * 1024):.1f} MB")
        return True

    except Exception as e:
        if filepath.exists():
            filepath.unlink()
        print(f"\n    ERROR: {e}")
        return False


def save_metadata(episodes: list[EpisodeMeta], metadata_file: Path) -> None:
    """Save episode metadata to JSON."""
    data = [ep.model_dump() for ep in episodes]
    metadata_file.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"Saved metadata for {len(episodes)} episodes to {metadata_file.name}")


def download_episodes(
    episodes: list[EpisodeMeta],
    episodes_dir: Path,
    dry_run: bool = False,
) -> tuple[int, list[str]]:
    """Download a list of episodes. Returns (downloaded_count, failed_titles)."""
    existing_files = {f.name for f in episodes_dir.iterdir() if f.suffix == ".mp3"}
    pending = [ep for ep in episodes if ep.filename not in existing_files]

    if dry_run:
        for ep in pending:
            dur_min = ep.duration_seconds // 60
            print(f"  Would download: {ep.filename} ({dur_min} min)")
        return 0, []

    if not pending:
        print("Nothing new to download.")
        return 0, []

    downloaded_count = 0
    failed = []
    start_time = time.time()

    for i, ep in enumerate(pending, 1):
        print(f"\n[{i}/{len(pending)}] Episode {ep.number or '?'}: {ep.title}")
        success = download_episode(ep, episodes_dir)
        if success:
            downloaded_count += 1
        elif not (episodes_dir / ep.filename).exists():
            failed.append(ep.title)

    elapsed = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"Downloaded: {downloaded_count} episodes in {elapsed / 60:.1f} min")
    if failed:
        print(f"Failed: {len(failed)}")
        for title in failed:
            print(f"  - {title}")

    return downloaded_count, failed


def main() -> None:
    parser = argparse.ArgumentParser(description="Download Gemischtes Hack episodes")
    parser.add_argument("--latest", type=int, nargs="?", const=1, metavar="N",
                        help="Download only the N newest episodes (default: 1)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be downloaded without downloading")
    parser.add_argument("--metadata-only", action="store_true",
                        help="Only update metadata.json, skip downloads")
    args = parser.parse_args()

    EPISODES_DIR.mkdir(parents=True, exist_ok=True)

    episodes = fetch_feed()

    if args.metadata_only:
        save_metadata(episodes, METADATA_FILE)
        return

    if args.latest:
        to_download = sorted(episodes, key=lambda e: e.number or 0, reverse=True)[:args.latest]
        to_download.reverse()
    else:
        to_download = episodes

    print(f"\nTotal episodes: {len(episodes)}")
    existing = len([f for f in EPISODES_DIR.iterdir() if f.suffix == ".mp3"])
    print(f"Already downloaded: {existing}")
    print(f"To download: {len(to_download)}")

    download_episodes(to_download, EPISODES_DIR, dry_run=args.dry_run)

    save_metadata(episodes, METADATA_FILE)


if __name__ == "__main__":
    main()
