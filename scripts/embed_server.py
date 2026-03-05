"""Tiny HTTP server for embedding queries with multilingual-e5-small."""

import json
from http.server import BaseHTTPRequestHandler, HTTPServer

from sentence_transformers import SentenceTransformer

from scripts.config import EMBEDDING_MODEL

model = None
QUERY_PREFIX = "query: "


class EmbedHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        text = body.get("text", "")

        if not text:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "missing text"}).encode())
            return

        prefixed = QUERY_PREFIX + text
        embedding = model.encode([prefixed], normalize_embeddings=True)[0].tolist()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps({"embedding": embedding}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress request logs


def main():
    global model
    print(f"Loading {EMBEDDING_MODEL}...")
    model = SentenceTransformer(EMBEDDING_MODEL)
    print("Model loaded. Starting server on :8787")
    server = HTTPServer(("127.0.0.1", 8787), EmbedHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
