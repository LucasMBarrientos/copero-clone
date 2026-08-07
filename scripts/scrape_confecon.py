"""Scrape the Confecon fictional football universe (sites.google.com/view/confecon)
into a static data/countries.json catalog for the career-sim game.

Confecon publishes one Google Sheet per country, embedded on each country's
"Ligas" page. Each sheet's 1st-division tab lists real (if fictional) club
data: name, city, stadium, capacity, founding date, squad size, OVR and
market value. This script pulls that tab as CSV (no auth needed) and writes
a clean JSON catalog, plus caches the raw CSV per country for provenance.

Re-run any time to refresh the catalog if Confecon's sheets change:

    python scripts/scrape_confecon.py

Source: https://sites.google.com/view/confecon
Purely fictional data, used here for a non-commercial, playful career-sim
fan project unrelated to Confecon or Copero.
"""
from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "countries.raw"
OUT_PATH = ROOT / "data" / "countries.json"

# slug -> (display name, spreadsheet id), collected by inspecting each
# country's "Ligas" page on https://sites.google.com/view/confecon
COUNTRIES: dict[str, tuple[str, str]] = {
    "mirmania": ("Mirmania", "15-tIwNQqLiHfZDM3PfsgJ8KpImZPzUKKl-g7-lu8ObI"),
    "kentimbo": ("Kentimbo", "1BXC7xG3y7ggtsF3lS-2HE8AqWQm26DqLhTUoLWtPNvY"),
    "zirmagna": ("Zirmagna", "1Ub_iJ1o4o8LRCHp9b931--wbkHwDTUuh2WPg6ujG1ek"),
    "alartela": ("Alartela", "1HS2EOQWMJ8ka3pn6n8eRdGKzNf4BVcoUe-xKQOI2m80"),
    "pasburgo": ("Pasburgo", "1_vAyGumHJeiC0jHq5R-tu71LzNvbhgNfRjuMozd9n2c"),
    "jopan": ("Jopán", "1pNSlZO-reqr_iOurqm2h-fY1LdJ9loiezwHPOi1p5ss"),
    "liconia": ("Liconia", "1GX6N9nQBANz8F_ceyf311ZDssrndSGUNNrg6S6I2Tqw"),
    "everia": ("Everiá", "1-Ae8c0mfRCVVhwVrBmxSoEyQ7wioL8dIwGK6DeoI4xU"),
    "razu": ("Razú", "1QwNI2Pt_H5VPGcG0Zr7INzS8yfuJz4DLfJQYn1SAv5g"),
    "baigorria": ("Baigorria", "1mQf5M0wOj7KF5a7wQQoyR84Ed8402yhZs1i0Prq_9aU"),
    "paltia": ("Paltia", "1c62-Wsaj96f95cIlo8EHIDkOuPwVk2QfBJ-7hpZhOj4"),
}

CSV_URL = "https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv"


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    normalized = normalized.lower().strip()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return normalized


def parse_number(raw: str) -> float | None:
    raw = raw.strip().replace("$", "").strip()
    if not raw or raw.upper() == "#REF!":
        return None
    # Confecon uses "." as thousands separator and "," as decimal separator.
    raw = raw.replace(".", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def normalize_header(cell: str) -> str:
    cell = unicodedata.normalize("NFKD", cell).encode("ascii", "ignore").decode()
    return cell.strip().lower()


def fetch_csv(sheet_id: str) -> str:
    url = CSV_URL.format(sheet_id=sheet_id)
    with urllib.request.urlopen(url, timeout=30) as resp:
        return resp.read().decode("utf-8")


def fallback_ovr(seed: str) -> float:
    # Deterministic pseudo-random OVR (58-82) for rows where Confecon's own
    # sheet has a broken formula (#REF!) -- keeps the club playable instead
    # of dropping it, without pretending it's real scraped data.
    h = sum(seed.encode("utf-8"))
    return round(58 + (h % 25), 2)


def fallback_valor(ovr: float) -> int:
    base = max(0.0, ovr - 50)
    return int(base**3 * 15000) or 5_000_000


def find_columns(header: list[str]) -> dict[str, int]:
    cols: dict[str, int] = {"nombre": 1}
    for idx, raw_cell in enumerate(header):
        cell = normalize_header(raw_cell)
        if cell == "ciudad":
            cols["ciudad"] = idx
        elif cell == "estadio":
            cols["estadio"] = idx
        elif cell == "capacidad":
            cols["capacidad"] = idx
        elif cell == "fundacion":
            cols["fundacion"] = idx
        elif cell.startswith("jug"):
            cols["plantel"] = idx
        elif cell == "ovr":
            cols["ovr"] = idx
        elif cell == "($)" or (cell.startswith("$") and len(cell) <= 4):
            cols["valorMercado"] = idx
    return cols


def cell(row: list[str], idx: int | None) -> str:
    if idx is None or idx >= len(row):
        return ""
    value = row[idx].strip()
    return "" if value.upper() == "#REF!" else value


DIVISION_ORDINALS = [
    (1, ("1st division", "primera division", "primera divisao", "primeira divisao", "superlig pasburg",
         "liga premier", "1o division", "1º division", "1o divisao", "liga jopan", "primera division kentimbiana",
         "mirmanian league - 1st division")),
    (2, ("2nd division", "segunda division", "segunda divisao", "superlig 2", "2o division", "2º division",
         "segunda division kentimbiana", "championship")),
    (3, ("3rd division", "tercera division", "superlig 3", "3o division")),
    (4, ("4th division", "cuarta division", "4o division")),
]


def division_level(text: str) -> int | None:
    """Map a division-header row's text to a division number (1..4)."""
    norm = normalize_header(text)
    for level, needles in DIVISION_ORDINALS:
        for needle in needles:
            if needle in norm:
                return level
    return None


MIN_DIVISION_SPREAD = 10

COLUMN_WORDS = {"club", "ciudad", "estadio", "capacidad", "fundacion", "jug.", "jug", "ovr",
                "($)", "colores", "titulos nac.", "titulos int.", "ojeador", "1° año en la div.",
                "1o ano en la div.", "títulos nac.", "titulos nac", "1º año en la div."}


def clean_division_name(text: str) -> str:
    """Strip the column-header words that share the division-title row."""
    parts = [p.strip() for p in text.split()]
    kept: list[str] = []
    for part in parts:
        if normalize_header(part).strip(".,") in {w.strip(".,") for w in COLUMN_WORDS}:
            break
        kept.append(part)
    name = " ".join(kept).strip(" -|")
    # Drop leading emoji/symbols Confecon uses as row decorations.
    while name and not (name[0].isalnum()):
        name = name[1:].strip()
    return name or text.strip()


def is_division_header(row: list[str]) -> tuple[int, str] | None:
    """A division header row names a division (rather than listing a club)."""
    text = " ".join(c.strip() for c in row if c.strip())
    if not text:
        return None
    level = division_level(text)
    if level is None:
        return None
    return level, clean_division_name(text)


def parse_divisions(csv_text: str) -> list[dict]:
    """Split a country's sheet into divisions -> clubs.

    Confecon puts every division of a country in one tab, separated by a
    header row naming the division ("Segunda División", "Superlig 2.
    Pasburg", ...). We slice on those headers so promotion/relegation has
    real lower divisions to work with.
    """
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    if not rows:
        return []

    cols = find_columns(rows[0])
    first_header = is_division_header(rows[0])
    divisions: list[dict] = [
        {
            "nivel": first_header[0] if first_header else 1,
            "nombre": (first_header[1] if first_header else "Primera División"),
            "clubes": [],
        }
    ]

    for row in rows[1:]:
        header = is_division_header(row)
        if header:
            level, name = header
            divisions.append({"nivel": level, "nombre": name, "clubes": []})
            new_cols = find_columns(row)
            if len(new_cols) > 2:
                cols = new_cols
            continue

        nombre = cell(row, cols.get("nombre"))
        if not nombre or normalize_header(nombre) in {"club", ""}:
            continue
        capacidad = parse_number(cell(row, cols.get("capacidad")))
        plantel = parse_number(cell(row, cols.get("plantel")))
        ovr = parse_number(cell(row, cols.get("ovr")))
        valor = parse_number(cell(row, cols.get("valorMercado")))
        divisions[-1]["clubes"].append(
            {
                "slug": slugify(nombre),
                "nombre": nombre,
                "ciudad": cell(row, cols.get("ciudad")) or None,
                "estadio": cell(row, cols.get("estadio")) or None,
                "capacidad": int(capacidad) if capacidad else None,
                "fundacion": cell(row, cols.get("fundacion")) or None,
                "plantel": int(plantel) if plantel else None,
                "ovr": int(round(ovr)) if ovr is not None else None,
                "valorMercado": int(valor) if valor is not None else None,
            }
        )

    divisions = [d for d in divisions if d["clubes"]]
    fill_missing_ratings(divisions)
    return divisions


def fill_missing_ratings(divisions: list[dict]) -> None:
    """Fill OVR/value for clubs whose Confecon cells hold broken formulas.

    Confecon's sheets have plenty of `#REF!` cells. Rather than invent a value
    out of thin air (which previously produced 2nd-division clubs rated above
    the 1st division), we anchor each division's replacement values to the OVR
    range that division's *own* intact rows show, and keep every division's
    ceiling below the division above it.
    """
    ceiling = None
    for div in sorted(divisions, key=lambda d: d["nivel"]):
        known = [c["ovr"] for c in div["clubes"] if c["ovr"] is not None]
        if known:
            lo, hi = min(known), max(known)
        elif ceiling is not None:
            lo, hi = max(40, ceiling - 10), ceiling
        else:
            lo, hi = 60, 70
        # A division whose sheet has almost no intact OVR cells collapses to a
        # single value; widen it so clubs are still distinguishable.
        if hi - lo < MIN_DIVISION_SPREAD:
            mid = (lo + hi) / 2
            lo = int(round(mid - MIN_DIVISION_SPREAD / 2))
            hi = lo + MIN_DIVISION_SPREAD
        if ceiling is not None and hi >= ceiling:
            # Compress this division so it sits strictly below the one above.
            span = max(1, hi - lo)
            hi_new = ceiling - 1
            lo_new = max(40, hi_new - span)
            for club in div["clubes"]:
                if club["ovr"] is not None:
                    ratio = (club["ovr"] - lo) / span
                    club["ovr"] = int(round(lo_new + ratio * (hi_new - lo_new)))
            lo, hi = lo_new, hi_new

        for club in div["clubes"]:
            if club["ovr"] is None:
                # Deterministic pick inside this division's band.
                h = sum(club["nombre"].encode("utf-8"))
                club["ovr"] = int(lo + (h % max(1, hi - lo + 1)))
            if club["valorMercado"] is None:
                club["valorMercado"] = fallback_valor(club["ovr"])
        ceiling = min(c["ovr"] for c in div["clubes"])


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    countries = []
    for slug, (nombre, sheet_id) in COUNTRIES.items():
        print(f"Fetching {nombre}...")
        csv_text = fetch_csv(sheet_id)
        (RAW_DIR / f"{slug}.csv").write_text(csv_text, encoding="utf-8")
        divisions = parse_divisions(csv_text)
        if not divisions:
            print(f"  WARNING: no clubs parsed for {nombre}, skipping")
            continue

        seen_slugs: dict[str, int] = {}
        for div in divisions:
            for club in div["clubes"]:
                base = club["slug"]
                seen_slugs[base] = seen_slugs.get(base, 0) + 1
                if seen_slugs[base] > 1:
                    club["slug"] = f"{base}-{seen_slugs[base]}"

        countries.append(
            {
                "slug": slug,
                "nombre": nombre,
                "bandera": f"assets/flags/{slug}.svg",
                "divisiones": divisions,
            }
        )
        total = sum(len(d["clubes"]) for d in divisions)
        detail = ", ".join(f"D{d['nivel']}:{len(d['clubes'])}" for d in divisions)
        print(f"  {total} clubs ({detail})")

    OUT_PATH.write_text(
        json.dumps({"paises": countries}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {OUT_PATH} with {len(countries)} countries")


if __name__ == "__main__":
    main()
