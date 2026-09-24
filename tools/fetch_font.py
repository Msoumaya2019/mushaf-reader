"""
Prepare la police du mushaf.

La police Uthmanic Hafs n'est PAS redistribuable : sa licence KFGQPC
interdit la vente, la modification et la decompilation, et n'autorise la
distribution que telle quelle, accompagnee de sa licence. Elle ne doit donc
pas etre versionnee dans un depot public.

Ce script la copie depuis un IPA deja sur la machine. C'est une operation
locale, faite par le detenteur des droits, au moment de compiler -- pas une
redistribution.

    python tools/fetch_font.py <chemin/vers/source.ipa>
"""

import argparse
import shutil
import sys
import zipfile
from pathlib import Path

DEST = Path(__file__).resolve().parent.parent / "assets" / "fonts"
WANTED = "UthmanicHafs.ttf"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ipa", help="IPA contenant UthmanicHafs.ttf")
    args = ap.parse_args()

    src = Path(args.ipa)
    if not src.is_file():
        print(f"introuvable : {src}", file=sys.stderr)
        return 1

    DEST.mkdir(parents=True, exist_ok=True)
    out = DEST / WANTED

    with zipfile.ZipFile(src) as z:
        # La police vit a la racine du bundle .app, pas dans un sous-dossier.
        members = [
            n
            for n in z.namelist()
            if n.endswith("/" + WANTED) and n.count("/") == 2
        ]
        if not members:
            print(
                f"{WANTED} absent de {src.name} (cherche a la racine du .app)",
                file=sys.stderr,
            )
            return 1

        with z.open(members[0]) as fh, out.open("wb") as dst:
            shutil.copyfileobj(fh, dst)

    print(f"ecrit : {out} ({out.stat().st_size} octets)")
    print("licence : KFGQPC -- voir assets/fonts/LICENSE-UthmanicHafs.txt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
