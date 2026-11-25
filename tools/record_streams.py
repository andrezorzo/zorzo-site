"""Record the API's search-only streams that the browser tests replay (zorzo-api spec F01, seam 2).

The API must answer over the same database whose publish produced tests/fixtures/data/, so the hit ids match
the fixture corpus (AGENTS.md, "Refresh the recorded streams"). Each body is saved byte for byte, `: ping`
comments included, and the SSE schema is copied next to the streams so the tests validate them.

  python3 tools/record_streams.py [API_URL] [ZORZO_API_DIR]

The defaults are http://127.0.0.1:8000 and ../zorzo-api. The error stream (streams/error.sse) is written by
hand, because the API emits `error` only on a bug; the tests validate it like the recorded ones.
"""
import json, shutil, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "fixtures" / "streams"
SESSION = "7d0f4c2e-5b1a-4c3e-9f6d-2a8b1c0e4d55"   # any UUID: the API keeps no state in search-only mode
# The dummy token of Turnstile's test site keys; the API runs with the always-pass test secret, which accepts it.
TOKEN = "XXXX.DUMMY.TOKEN.XXXX"
QUESTIONS = {
    "passages": "backend AWS remote business hours events queues hybrid search citation",   # six fixture hits
    "no-passages": "zebra quantum lasagna",                                                    # no hit
}

api = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
zorzo_api = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT.parent / "zorzo-api"
OUT.mkdir(parents=True, exist_ok=True)
for name, question in QUESTIONS.items():
    body = json.dumps({"q": question, "session": SESSION, "turnstile": TOKEN}).encode()
    request = urllib.request.Request(f"{api}/api/v1/ask", body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        (OUT / f"{name}.sse").write_bytes(response.read())
shutil.copyfile(zorzo_api / "contracts" / "sse-v1.schema.json", ROOT / "tests" / "fixtures" / "sse-v1.schema.json")
print(f"{len(QUESTIONS)} streams and the schema → tests/fixtures/")
