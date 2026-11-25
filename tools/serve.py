"""Serve the site locally with one origin, as CloudFront does in production (zorzo-api ADR 0003).

Static files from the repository root, as `python3 -m http.server` would, and `/api/*` forwarded to the API,
with the response streamed as it arrives so the question's events show live.

  python3 tools/serve.py [PORT]      (or: npm run serve)

PORT defaults to 4173; the API address comes from API_URL (default http://127.0.0.1:8000). Binds to 127.0.0.1.
"""
import http.client, os, sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
API = urlsplit(os.environ.get("API_URL", "http://127.0.0.1:8000"))
FORWARDED = ("Content-Type", "Accept")                                    # request headers the API reads
HOP_BY_HOP = {"connection", "keep-alive", "transfer-encoding", "upgrade"}   # never copied back


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/"): self.forward()
        else: super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"): self.forward()
        else: self.send_error(405)

    def forward(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        headers = {k: self.headers[k] for k in FORWARDED if self.headers[k]}
        api = http.client.HTTPConnection(API.hostname, API.port or 80, timeout=60)
        try:
            api.request(self.command, self.path, body or None, headers)
            res = api.getresponse()
        except (OSError, http.client.HTTPException):
            api.close()
            self.send_error(503, "API unreachable")   # what the page reads as offline (zorzo-api LLD, "Front against the API")
            return
        try:
            self.send_response(res.status, res.reason)
            for name, value in res.getheaders():
                if name.lower() not in HOP_BY_HOP: self.send_header(name, value)
            self.end_headers()   # HTTP/1.0: the body ends when the connection closes
            while chunk := res.read1(65536):
                self.wfile.write(chunk)
                self.wfile.flush()
        except (OSError, http.client.HTTPException):
            pass   # the visitor left (a new question cancels the current one), or the API stopped mid-stream
        finally:
            api.close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    print(f"http://127.0.0.1:{port}  (/api/* → {API.geturl()})", flush=True)
    server.serve_forever()
