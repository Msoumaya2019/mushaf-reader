#!/usr/bin/env python3
"""Extrait et NORMALISE les donnees de recitation depuis l'IPA source.

Entree  : les fichiers read_N.json d'AlKetab (non embarques dans ce depot).
Sortie  : reciters.json -- un index compact et homogene.

Deux irregularites reelles de la source sont traitees ici. Elles ont ete
mesurees sur les 40 recitateurs, pas supposees.

1. Indexation des ayats. Trois conventions coexistent.

     1-based : Al-Fatiha va de 1 a 7          (21 recitateurs)
     0-based : Al-Fatiha va de 0 a 6          (13 recitateurs)
     mixte   : 0-based, sauf Al-Fatiha 1..7   ( 6 recitateurs)

   On ramene tout a une convention unique : la position dans le tableau
   *est* le numero de verset, indexe de 0 a n-1 dans l'ordre canonique.
   Un consommateur n'a donc jamais a lire le champ `ayah`.

2. Basmala. 18 recitateurs sur 40 recoivent la basmala comme segment audio
   distinct, porte par une entree `ayah: 0` placee AVANT le verset 1, sur
   environ 113 sourates (toutes sauf At-Tawba, qui n'en a pas). Ce n'est pas
   une erreur de la source : c'est un instant audio reel.
   On la conserve, dans un champ `basmala` separe, pour que le lecteur
   puisse la mettre en evidence sans decaler le surlignage des versets.

Usage:
    python extract_reciters.py <chemin_vers_le_dossier_app_source>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Nombre canonique de versets par sourate (lecture Hafs).
VERSES_PER_SURAH = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99,
    128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
    34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35,
    38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11,
    11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40,
    46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8,
    8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
]

# At-Tawba (9) est la seule sourate sans basmala.
SURAH_WITHOUT_BASMALA = 9


def detect_offset(chapters: list[dict]) -> int:
    """Determine le decalage d'indexation d'un recitateur.

    Renvoie 1 si la donnee est 1-based, 0 si elle est 0-based.

    La difficulte : une entree `ayah: 0` est ambiguë. Elle peut etre soit un
    preambule (isti'adha / basmala) place avant le verset 1, soit le verset 1
    lui-meme chez un recitateur qui indexe a partir de 0. Au niveau d'une
    seule sourate, les deux lectures sont indiscernables.

    On tranche donc globalement, en comparant le nombre d'entrees au total
    canonique de la sourate :

      - count == canon          -> indexation 0-based (pas de preambule)
      - count == canon + 1      -> indexation 0-based avec preambule
      - count == canon          -> indexation 1-based (pas de preambule)
      - count == canon + 1      -> indexation 1-based avec preambule

    Les deux premieres lignes se confondent, d'ou l'utilisation de la borne
    haute des ayats, qui leve l'ambiguite sans ambiguite possible.
    """
    # On choisit une sourate sans preambule chez personne : Al-Fatiha et
    # At-Tawba n'en ont pas toujours, donc on prefere une sourate ou
    # l'observation est la plus riche -- on balaie et on tranche par
    # consensus sur l'ensemble des sourates.
    votes = {0: 0, 1: 0}

    for ch in chapters:
        index = ch["id"]
        expected = VERSES_PER_SURAH[index - 1]
        timings = ch.get("aya_timing") or []
        if not timings:
            continue

        last = timings[-1]["ayah"]

        # Une sourate dont la source est fautive (versets manquants ou en
        # trop) ne doit pas peser dans le vote : elle sera ecartee plus tard.
        # On la reconnait au fait que son compte d'entrees ne tombe ni sur
        # `expected` ni sur `expected + 1`.
        if len(timings) not in (expected, expected + 1):
            continue

        # Le dernier ayat est sans ambiguite : soit `expected` (1-based),
        # soit `expected - 1` (0-based).
        if last == expected:
            votes[1] += 1
        elif last == expected - 1:
            votes[0] += 1

    if votes[1] == 0 and votes[0] == 0:
        raise ValueError("aucune sourate exploitable pour determiner l'indexation")

    # On tranche a la majorite. Un recitateur peut porter quelques sourates
    # discordantes -- la source n'est pas parfaitement homogene -- mais elles
    # sont minoritaires et seront ecartees une par une dans normalize().
    return 1 if votes[1] >= votes[0] else 0


def normalize(chapters: list[dict]) -> tuple[list[list[list[int]]], list[list[int] | None], list[int]]:
    """Ramene les timings a une forme unique.

    Renvoie (timings, openings, broken_surahs) ou :
      timings[sourate - 1][verset - 1] = [debut_ms, fin_ms]
      openings[sourate - 1]            = [debut_ms, fin_ms] ou None
      broken_surahs                    = numeros des sourates dont la source
                                         est incoherente et qu'on ecarte

    Une entree `ayah: 0` est un preambule seulement si l'indexation est
    1-based : chez un recitateur 0-based, 0 est le verset 1.

    4 recitateurs sur 40 portent des sourates fautives dans la source
    d'origine -- versets manquants ou en trop. On ne les invente pas et on
    ne les decale pas : on retire la sourate du recitateur et on la signale,
    pour qu'un consommateur ne puisse pas afficher un surlignage faux.
    """
    offset = detect_offset(chapters)

    timings: list[list[list[int]]] = []
    openings: list[list[int] | None] = []
    broken: list[int] = []

    for index, ch in enumerate(chapters, start=1):
        if ch["id"] != index:
            raise ValueError(f"sourate {index}: id {ch['id']} au lieu de {index}")

        expected = VERSES_PER_SURAH[index - 1]
        opening: list[int] | None = None
        row: list[list[int]] = []

        entries = ch["aya_timing"]
        # Bornes acceptables du nombre d'entrees.
        if len(entries) not in (expected, expected + 1):
            broken.append(index)
            timings.append([])
            openings.append(None)
            continue

        for t in entries:
            ayah = t["ayah"]
            span = [int(t["start_time"]), int(t["end_time"])]

            if ayah == 0 and offset == 1:
                if opening is not None:
                    raise ValueError(f"sourate {index}: preambule en double")
                opening = span
                continue

            row.append(span)

        if len(row) != expected:
            broken.append(index)
            timings.append([])
            openings.append(None)
            continue

        # Controle de progression : la source doit s'enchainer sans recul.
        # Deux defauts reels ont ete observes, tous deux sur la derniere
        # entree d'une sourate :
        #
        #   - `end_time` plus petit que `start_time`, valeur sentinelle
        #     corrompue : l'app source ne connait pas la fin du fichier ;
        #   - recul du `start_time` sur l'entree suivante.
        #
        # Un dernier segment sans fin exploitable est repare en le bornant a
        # son debut : il n'aura pas de duree, donc ne sera jamais surligne,
        # mais les versets precedents restent utilisables. Ecarter toute la
        # sourate pour un seul verset serait excessif.
        if row and row[-1][1] < row[-1][0]:
            row[-1] = [row[-1][0], row[-1][0]]

        if any(row[i][0] < row[i - 1][1] for i in range(1, len(row))):
            broken.append(index)
            timings.append([])
            openings.append(None)
            continue

        timings.append(row)
        openings.append(opening)

    return timings, openings, broken


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    app_dir = Path(sys.argv[1])
    files = sorted(
        app_dir.glob("read_*.json"),
        key=lambda p: int(p.stem.split("_")[1]),
    )
    if not files:
        print(f"aucun read_*.json dans {app_dir}", file=sys.stderr)
        return 1

    reciters = []
    basmala_count = 0
    degraded: list[tuple[int, list[int]]] = []

    for path in files:
        raw = json.loads(path.read_text(encoding="utf-8"))
        chapters = raw["chapters"]
        if len(chapters) != 114:
            raise ValueError(f"{path.name}: {len(chapters)} sourates au lieu de 114")

        timings, openings, broken = normalize(chapters)
        if any(o is not None for o in openings):
            basmala_count += 1
        if broken:
            degraded.append((raw["id"], broken))

        reciters.append(
            {
                "id": raw["id"],
                "name": raw["name"],
                "nameEn": raw["name_en"],
                "rewaya": raw["rewaya"],
                "provider": raw["provider"],
                "folderUrl": raw["folder_url"],
                "format": raw["format"],
                "timings": timings,
                "openings": openings,
                "brokenSurahs": broken,
            }
        )

    out_path = Path(__file__).resolve().parent.parent / "data" / "reciters.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(
            {"versesPerSurah": VERSES_PER_SURAH, "reciters": reciters},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    total = sum(len(s) for r in reciters for s in r["timings"])
    print(f"{len(reciters)} recitateurs, {total} versets horodates")
    if degraded:
        print(f"{len(degraded)} recitateurs avec des sourates ecartees :")
        for rid, surahs in degraded:
            print(f"  id {rid}: sourates {surahs}")
    print(f"{basmala_count} recitateurs portent un preambule distinct (basmala / isti'adha)")
    print(f"ecrit: {out_path} ({out_path.stat().st_size} octets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
