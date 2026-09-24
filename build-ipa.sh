#!/usr/bin/env bash
#
# Produit l'IPA NON SIGNE a partir de ce projet.
#
# A executer sur macOS : la compilation iOS exige Xcode, qui n'existe que la.
# Depuis Windows, passer par un runner macOS de GitHub Actions (voir README) :
# `xcodebuild ... CODE_SIGNING_ALLOWED=NO` y fait exactement la meme chose.
#
#   1. npm install
#   2. python tools/fetch_font.py <source.ipa>   # la police n'est pas versionnee
#   3. ./build-ipa.sh
#
# NE PAS utiliser `eas build` : ce service exige des identifiants Apple et
# produit un IPA SIGNE. La signature est desactivee ici, c'est tout l'objet.
#
set -euo pipefail

cd "$(dirname "$0")"

SORTIE_BUILD="build"
IPA="coran-memoire-reader-unsigned.ipa"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "Ce script exige macOS (Xcode)." >&2
  echo "Depuis Windows : voir la section GitHub Actions du README." >&2
  exit 1
fi

if [[ ! -f assets/fonts/UthmanicHafs.ttf ]]; then
  echo "Police absente : lancer d'abord" >&2
  echo "  python tools/fetch_font.py <source.ipa>" >&2
  exit 1
fi

echo "--- epreuves ---"
npm test

echo "--- types ---"
npm run check

echo "--- generation du projet Xcode ---"
npx expo prebuild --platform ios --clean

# Le nom du workspace et celui du scheme sont derives du slug par Expo, et
# cette derivation a change selon les versions. On les lit donc sur ce que
# prebuild vient d'ecrire, plutot que de les deviner.
PROJET="$(find ios -maxdepth 1 -name "*.xcworkspace" | head -1)"
if [[ -z "$PROJET" ]]; then
  echo "Aucun .xcworkspace dans ios/ : prebuild a echoue." >&2
  exit 1
fi
SCHEMA="$(xcodebuild -workspace "$PROJET" -list -json 2>/dev/null \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['workspace']['schemes'][0])")"
if [[ -z "$SCHEMA" ]]; then
  echo "Aucun scheme trouve dans $PROJET." >&2
  exit 1
fi

echo "  workspace : $PROJET"
echo "  scheme    : $SCHEMA"

echo "--- compilation, signature desactivee ---"
rm -rf "$SORTIE_BUILD" "$IPA"
xcodebuild \
  -workspace "$PROJET" \
  -scheme "$SCHEMA" \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath "$SORTIE_BUILD" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  EXPANDED_CODE_SIGN_IDENTITY="" \
  build

APP="$(find "$SORTIE_BUILD/Build/Products/Release-iphoneos" -maxdepth 1 -name "*.app" | head -1)"
if [[ -z "$APP" ]]; then
  echo "Aucun .app produit : la compilation a echoue." >&2
  exit 1
fi

echo "--- empaquetage en IPA ---"
rm -rf Payload
mkdir -p Payload
cp -R "$APP" Payload/
# La signature residuelle de l'executable est retiree : sinon le service de
# signature recoit un binaire deja signe, ce qui est le cas qu'on veut eviter.
codesign --remove-signature "Payload/$(basename "$APP")/$(basename "$APP" .app)" 2>/dev/null || true
zip -qry "$IPA" Payload
rm -rf Payload

echo
echo "IPA : $(pwd)/$IPA"
echo "A signer avec votre service habituel."
