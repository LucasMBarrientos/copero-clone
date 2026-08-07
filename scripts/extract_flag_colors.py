"""Derive a national jersey palette (primary/secondary/tertiary + kit pattern)
per fictional country from its flag SVG, since Confecon has no national-team
kit data (it's a club-only universe). Purely a best-effort heuristic reading
of the flag's own fills/shapes -- not scraped from anywhere else.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FLAGS_DIR = ROOT / "assets" / "flags"
OUT_PATH = ROOT / "data" / "kits.json"

COUNTRIES = [
    "mirmania", "kentimbo", "zirmagna", "alartela", "pasburgo",
    "jopan", "liconia", "everia", "razu", "baigorria", "paltia",
]


def extract_fills(svg_text: str) -> list[str]:
    fills = re.findall(r'fill="(#[0-9a-fA-F]{6})"', svg_text)
    # de-dup preserving order
    seen = []
    for f in fills:
        if f.lower() not in [s.lower() for s in seen]:
            seen.append(f)
    return seen


def classify_pattern(svg_text: str) -> str:
    rects = re.findall(r"<rect[^/]*/>", svg_text)
    # Skip the first rect -- it's always the full-canvas background fill.
    rest = rects[1:]
    full_width_bands = [r for r in rest if 'width="512"' in r]
    full_height_bands = [r for r in rest if 'height="512"' in r]
    if len(full_width_bands) >= 3:
        # The jersey renderer only supports vertical_stripes/checkerboard/
        # diagonal_sash/solid (matching Copero's own kit_type enum) -- a
        # horizontal-banded flag reads closest as a checkerboard fabric.
        return "checkerboard"
    if len(full_height_bands) >= 2:
        return "vertical_stripes"
    if "polygon" in svg_text and re.search(r'points="0,512 512,0', svg_text):
        return "diagonal_sash"
    return "solid"


def main():
    kits = {}
    for slug in COUNTRIES:
        svg_text = (FLAGS_DIR / f"{slug}.svg").read_text(encoding="utf-8")
        fills = extract_fills(svg_text)
        # Drop near-white/near-black detail colors (emblem ink) when possible,
        # keep the first two saturated background fills as primary/secondary.
        bg_fills = [f for f in fills if f.lower() not in ("#f4f4f4", "#111111", "#1a0a10")]
        primary = bg_fills[0] if bg_fills else (fills[0] if fills else "#333333")
        secondary = bg_fills[1] if len(bg_fills) > 1 else None
        tertiary = "#FFFFFF"
        kits[slug] = {
            "primary": primary,
            "secondary": secondary,
            "tertiary": tertiary,
            "pattern": classify_pattern(svg_text) if secondary else "solid",
        }
    OUT_PATH.write_text(json.dumps(kits, indent=2), encoding="utf-8")
    print(json.dumps(kits, indent=2))


if __name__ == "__main__":
    main()
