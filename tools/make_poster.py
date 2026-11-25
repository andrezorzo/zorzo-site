# /// script
# dependencies = ["playwright", "pillow"]
# ///
"""Render the static brain poster (fallback when WebGL is missing, and first paint before three.js loads).

Opens the hero in headless Chrome at a portrait viewport where the brain geometry is known
(cx = W/2, cy = 0.31 H, u = min(0.46 W, 0.27 H), see targetGeo in assets/js/scene/scene.js), hides everything but the
canvas, shoots it on black (the page blends it with `screen`) and crops the box x ∈ [-BX, BX], y ∈ [-TOP, BOT] in brain units (u).
styles.css places the image with the same box. Needs the site served at URL (npm run serve).

  uv run tools/make_poster.py http://127.0.0.1:4173/
"""
import asyncio, sys
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173/"
OUT = Path(__file__).resolve().parent.parent / "assets" / "poster.webp"
W, H, DPR = 1000, 1400, 2
BX, TOP, BOT = 1.05, 0.7, 1.34          # crop box in brain units, must match .poster in styles.css


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-gl=angle", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": W, "height": H}, device_scale_factor=DPR)
        await pg.goto(URL + "?tier=2"); await pg.wait_for_timeout(1600)     # before the idle sway starts
        await pg.add_style_tag(content="html,body,.stage{background:#000!important} .stage>*:not(.scene){display:none!important}")
        await pg.locator("#scene").screenshot(path=str(OUT.with_suffix(".png")))
        await b.close()
    img = Image.open(OUT.with_suffix(".png"))
    u, cx, cy = min(0.46 * W, 0.27 * H) * DPR, W / 2 * DPR, 0.31 * H * DPR
    bb = img.convert("L").point(lambda v: 255 if v > 8 else 0).getbbox()
    print("lit bbox (units):", [round(v, 3) for v in ((bb[0] - cx) / u, (bb[1] - cy) / u, (bb[2] - cx) / u, (bb[3] - cy) / u)])
    crop = img.crop((round(cx - BX * u), round(cy - TOP * u), round(cx + BX * u), round(cy + BOT * u)))
    crop = crop.resize((crop.width * 5 // 8, crop.height * 5 // 8), Image.LANCZOS)
    flat = crop.convert("RGB")     # shot on black (the canvas is premultiplied + additive); CSS blends it with `screen`
    flat.save(OUT, "WEBP", quality=62, method=6)
    OUT.with_suffix(".png").unlink()
    print("wrote", OUT, crop.size, round(OUT.stat().st_size / 1024), "KB")

asyncio.run(main())
