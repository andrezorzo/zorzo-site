# /// script
# dependencies = ["trimesh", "numpy", "scipy", "fast-simplification"]
# ///
"""Brain point cloud for the hero (zorzo-site LLD, "Brain data").

Source mesh: "Brain Model", Nevit Dilmen, NIH 3D (3DPX-003455), from MRI. License CC BY-SA 4.0
(https://creativecommons.org/licenses/by-sa/4.0/). The derived point data (assets/data/brain.json) is shared
under the same license, with attribution. The mesh (43 MB) is not committed: download it to tools/src/
from https://3d.nih.gov/api/files/968627 and save it as brain3455.glb.

Everything here comes from the mesh alone; the corpus is placed in the browser (assets/js/scene/layout.js):
  dust    surface points + convexity (gyri crests bright, sulci dim)
  pools   per region, crest points in farthest-point order: the first k are evenly spread, so the browser
          gives a region's k chunks its first k points
  hubs    fixed points for the static navigation cards

  uv run tools/build_brain.py [n_dust]
"""
import json, sys
from pathlib import Path
import numpy as np, trimesh

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
rng = np.random.default_rng(7)
POOL = 400   # points per region: more than a region will hold for a long time

mesh = trimesh.load(HERE / "src" / "brain3455.glb", force="mesh")
# decimate: curvature only needs the large-scale folds
mesh = mesh.simplify_quadric_decimation(face_count=60000)
mesh.merge_vertices()
v = mesh.vertices.copy()

# normalize: centre and scale on the cerebrum (the long brainstem is ignored for this), length 2 along x
cereb = v[:, 1] > np.percentile(v[:, 1], 15)
c = (v[cereb].max(0) + v[cereb].min(0)) / 2
scale = 2.0 / (v[cereb, 0].max() - v[cereb, 0].min())
v = (v - c) * scale
mesh.vertices = v
# frontal lobe should face -x: the cerebellum (low, back) has the larger x where y is low
low = v[:, 1] < np.percentile(v[:, 1], 25)
if v[low, 0].mean() < 0:
    v[:, 0] *= -1; mesh.vertices = v; mesh.invert()
stem_y = -1.32   # normalized units: the brain bottom is ~ -0.95; keeps a short stem like the video

# convexity per vertex: how far the vertex sits out from its neighbours along its normal
nbr = mesh.vertex_neighbors
vn = mesh.vertex_normals
conv = np.zeros(len(v))
for i, ns in enumerate(nbr):
    if ns:
        conv[i] = np.dot(vn[i], v[i] - v[ns].mean(0))
# smooth with a 2-ring average so it follows folds, not triangles
for _ in range(2):
    conv = np.array([conv[[i] + list(ns)].mean() if ns else conv[i] for i, ns in enumerate(nbr)])
lo, hi = np.percentile(conv, [5, 95])
convn = np.clip((conv - lo) / (hi - lo), 0, 1)

# ---- dust: area-weighted surface samples, kept only above the stem cut
N_DUST = int(sys.argv[1]) if len(sys.argv) > 1 else 7000
pts, fid = trimesh.sample.sample_surface(mesh, N_DUST * 5, seed=3)
ok = pts[:, 1] > stem_y
pts, fid = pts[ok], fid[ok]
fconv = convn[mesh.faces[fid]].mean(1)
# favour crests so the folds read as lines
acc = rng.random(len(pts)) < (0.12 + 0.88 * fconv ** 1.6)
pts, fconv = pts[acc][:N_DUST], fconv[acc][:N_DUST]
print("dust", len(pts))

# ---- regions (lobes), on the normalized brain: x front(-)→back(+), y up
def region(p):
    px, py = p[..., 0], p[..., 1]
    r = np.full(px.shape, "parietal", dtype=object)
    r[px < -0.28] = "frontal"
    r[(py < -0.12) & (px > -0.55) & (px < 0.45)] = "temporal"
    r[px > 0.5] = "occipital"
    r[(py < -0.42) & (px > 0.12)] = "cerebellum"
    r[py < -0.98] = "stem"
    return r
reg = region(pts)

def farthest_order(cands, k):
    """Up to k points of cands in farthest-point order, seeded at the one nearest their mean."""
    chosen = [int(np.argmin(np.linalg.norm(cands - cands.mean(0), axis=1)))]
    d = np.linalg.norm(cands - cands[chosen[0]], axis=1)
    for _ in range(min(k, len(cands)) - 1):
        j = int(np.argmax(d)); chosen.append(j)
        d = np.minimum(d, np.linalg.norm(cands - cands[j], axis=1))
    return cands[chosen]

# chunk slots sit a little outside the surface, on the crests
pools = {r: (farthest_order(pts[(reg == r) & (fconv > 0.4)], POOL) * 1.015).round(4).tolist()
         for r in ("frontal", "temporal", "parietal", "occipital")}
print({r: len(p) for r, p in pools.items()})

def nearest_surface(q):
    return pts[int(np.argmin(np.linalg.norm(pts - np.array(q), axis=1)))]
HUBS = [
    ("resume",   "frontal",   (-0.92, 0.18, 0.35)),
    ("projects", "temporal",  (-0.10, -0.36, 0.55)),
    ("how",      "parietal",  (0.10, 0.62, 0.30)),
    ("blog",     "occipital", (0.82, 0.12, 0.30)),
    ("contact",  "cerebellum", (0.50, -0.62, 0.30)),
]
hubs = [{"id": h, "region": r, "p": (nearest_surface(q) * 1.03).round(4).tolist()} for h, r, q in HUBS]

out = {
    "license": "Derived from 'Brain Model' by Nevit Dilmen (NIH 3D 3DPX-003455), CC BY-SA 4.0",
    "dust": pts.round(3).tolist(),
    "bright": fconv.round(2).tolist(),
    "pools": pools,
    "hubs": hubs,
}
sys.path.insert(0, str(HERE))
from pack_brain import pack   # big arrays → flat integers, compact JSON
pack(out, ROOT / "assets" / "data")
