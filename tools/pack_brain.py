"""Pack the brain data for the web as compact JSON (readable, compresses well behind CloudFront).

The data is derived from "Brain Model" by Nevit Dilmen (NIH 3D 3DPX-003455), CC BY-SA 4.0.

The big arrays become flat integer arrays (coordinate = value / q):
  dust    [x0, y0, z0, x1, ...]
  pools   {region: [x0, y0, z0, ...]}
  bright  [b0, b1, ...]                  convexity = value / 100
Everything else (license, hubs) stays as is. A file with "q" in it is already packed.

Usage: build_brain.py calls pack(); to repack an unpacked brain.json:
  python3 tools/pack_brain.py assets/data/brain.json
"""
import json, sys
from pathlib import Path

Q = 10000   # pools keep 4 decimals; dust has 3, so this is lossless for both


def flat(points: list) -> list[int]:
    return [round(c * Q) for p in points for c in p]


def pack(data: dict, out_dir: Path) -> None:
    out = dict(data)
    out["q"] = Q
    out["dust"] = flat(data["dust"])
    out["pools"] = {r: flat(p) for r, p in data["pools"].items()}
    out["bright"] = [round(b * 100) for b in data["bright"]]
    dst = out_dir / "brain.json"
    dst.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {dst} {round(dst.stat().st_size / 1024, 1)} KB")


if __name__ == "__main__":
    src = Path(sys.argv[1])
    data = json.loads(src.read_text())
    if "q" in data:
        sys.exit("already packed")
    pack(data, src.parent)
