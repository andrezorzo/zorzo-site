# /// script
# dependencies = ["pyyaml"]
# ///
"""Turn the prototype's mock corpus into the data the ingest publishes (zorzo-api LLD, "Published data").

The prototype searched a mock corpus (127 chunks of the résumé, the Prosa README, the GitHub profile and the
first site spec, placed by TF-IDF and t-SNE). Converted once, it is the local demo data that keeps the brain
as it looks today until the real corpus is ingested (F01-T12 plan, "Development data keeps today's brain").
Its entities become the front's entity list (assets/data/entities.json).

  uv run tools/convert_mock_corpus.py MOCK_CORPUS_JSON EXAMPLES_YAML

Writes demo-data/manifest.json, demo-data/<hash>/{corpus,examples}.json and assets/data/entities.json.
"""
import datetime, hashlib, json, re, sys, unicodedata
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
SOURCE_URL = {"prosa": "https://github.com/andrezorzo/prosa", "github": "https://github.com/andrezorzo"}


def dumps(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()


def slug(name: str) -> str:
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-")


mock = json.loads(Path(sys.argv[1]).read_text())
examples = [{"id": e["id"], "lang": e["lang"], "text": e["text"]} for e in yaml.safe_load(Path(sys.argv[2]).read_text())]
corpus = {
    "corpus_version": 0,
    "chunks": [
        {
            "id": k + 1,
            "doc_key": c["src"],
            "title": c["title"],
            "kind": c["kind"],
            "lang": "en",
            "heading": c["heading"],
            "text": c["text"],
            "source_url": SOURCE_URL.get(c["src"]),
            "p": c["p"],
        }
        for k, c in enumerate(mock["chunks"])
    ],
}
files = {"corpus.json": dumps(corpus), "examples.json": dumps(examples)}
digest = hashlib.sha256(files["corpus.json"] + b"\0" + files["examples.json"]).hexdigest()
out = ROOT / "demo-data"
for old in out.glob("*/"):
    for f in old.iterdir():
        f.unlink()
    old.rmdir()
(out / digest).mkdir(parents=True, exist_ok=True)
for name, content in files.items():
    (out / digest / name).write_bytes(content)
manifest = {
    "corpus_version": 0,
    "embed_model_tag": "mock-tfidf-tsne",
    "path": f"demo-data/{digest}/",
    "published_at": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
}
(out / "manifest.json").write_bytes(dumps(manifest))
entities = [{"id": f"e:{slug(e['name'])}", "name": e["name"], "type": e["type"]} for e in mock["entities"]]
(ROOT / "assets" / "data" / "entities.json").write_text(json.dumps(entities, ensure_ascii=False, indent=1) + "\n")
print(f"{len(corpus['chunks'])} chunks, {len(examples)} examples, {len(entities)} entities → demo-data/{digest}/")
