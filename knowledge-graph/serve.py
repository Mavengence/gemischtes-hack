"""Simple HTTP server for local development of the knowledge graph site."""

import http.server
import os
from pathlib import Path

SITE_DIR = Path(__file__).resolve().parent / "site"


def main() -> None:
    port = int(os.environ.get("PORT", 8080))
    os.chdir(SITE_DIR)
    handler = http.server.SimpleHTTPRequestHandler
    with http.server.HTTPServer(("", port), handler) as httpd:
        print(f"Serving {SITE_DIR} at http://localhost:{port}")
        print("Press Ctrl+C to stop")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
