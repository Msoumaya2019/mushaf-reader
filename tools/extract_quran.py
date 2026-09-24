#!/usr/bin/env python3
"""Extrait le texte coranique et la pagination du mushaf depuis l'IPA source.

Entree  : DB/quran-data.bin, un plist embarque dans l'app d'origine.
Sortie  : quran.json -- texte par verset + decoupage en 604 pages.

Le plist fournit deja l'essentiel, ce qui evite toute reconstruction :

  verses[6236]  { surah, ayah, page, juz, uthmanicHafsText, text, ... }
  pages[604]    { number, verseIDs[], headerSurahs[], juz, quarterIndex }
  surahs[114]   { number, arabicTitle, englishTitle, verseCount, firstPage }

On conserve les versets regroupes par page, dans l'ordre canonique, pour
que le lecteur n'ait jamais a filtrer 6236 entrees pour afficher une page.

Usage:
    python extract_quran.py <chemin_vers_le_dossier_app_source>
"""

from __future__ import annotations

import json
import plistlib
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    app_dir = Path(sys.argv[1])
    src = app_dir / "DB" / "quran-data.bin"
    if not src.is_file():
        print(f"introuvable: {src}", file=sys.stderr)
        return 1

    with src.open("rb") as handle:
        raw = plistlib.load(handle)

    verses = raw["verses"]
    pages = raw["pages"]
    surahs = raw["surahs"]
    juzs = raw["juzs"]

    if len(verses) != 6236:
        raise ValueError(f"{len(verses)} versets au lieu de 6236")
    if len(pages) != 604:
        raise ValueError(f"{len(pages)} pages au lieu de 604")

    # Index du texte par identifiant de verset, dans l'ordre du plist :
    # verseID est un simple compteur global, on verifie qu'il reste
    # consecutif, sinon l'indexation par page serait fausse.
    by_id: dict[int, dict] = {}
    for expected, v in enumerate(verses):
        if v["verseID"] != expected:
            raise ValueError(
                f"verseID {v['verseID']} en position {expected} : "
                "les identifiants doivent etre consecutifs"
            )
        by_id[expected] = v

    # Construction des pages : on garde le texte uthmani et le texte
    # vocalise, ainsi que la reference (sourate, verset) de chaque entree.
    out_pages = []
    for expected, page in enumerate(pages, start=1):
        if page["number"] != expected:
            raise ValueError(
                f"page {page['number']} en position {expected} : "
                "les numeros de page doivent etre consecutifs"
            )

        items = []
        for vid in page["verseIDs"]:
            if vid not in by_id:
                raise ValueError(f"page {expected}: verseID {vid} inconnu")
            v = by_id[vid]
            items.append(
                {
                    "surah": int(v["surah"]),
                    "ayah": int(v["ayah"]),
                    "uthmani": v["uthmanicHafsText"],
                    "tashkil": v["text"],
                }
            )

        if not items:
            raise ValueError(f"page {expected}: aucune entree")

        out_pages.append(
            {
                "number": expected,
                "juz": int(page["juz"]),
                "headerSurahs": [int(s) for s in page.get("headerSurahs", [])],
                "verses": items,
            }
        )

    # Le texte servi au lecteur est le uthmani Hafs : c'est celui qui
    # correspond a la fonte KFGQPC et au decoupage Madani.
    if not any(v.get("uthmanicHafsText") for v in verses):
        raise ValueError("aucun texte uthmani trouve")

    out = {
        "surahs": [
            {
                "number": int(s["number"]),
                "arabicTitle": s["arabicTitle"],
                "englishTitle": s["englishTitle"],
                "verseCount": int(s["verseCount"]),
                "firstPage": int(s["firstPage"]),
                "isMeccan": bool(s["isMeccan"]),
            }
            for s in surahs
        ],
        "juzs": [
            {
                "number": int(j["number"]),
                "arabicTitle": j["arabicTitle"],
                "firstPage": int(j["firstPage"]),
            }
            for j in juzs
        ],
        "pages": out_pages,
    }

    out_path = Path(__file__).resolve().parent.parent / "data" / "quran.json"
    out_path.write_text(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    total = sum(len(p["verses"]) for p in out_pages)
    print(f"{len(out_pages)} pages, {total} versets")
    print(f"{len(out['surahs'])} sourates, {len(out['juzs'])} juz")
    print(f"ecrit: {out_path} ({out_path.stat().st_size} octets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
