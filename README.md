# Apprendre le Coran — lecteur de mushaf

Lecteur de Coran où **l'affichage suit la récitation, verset par verset** :
à mesure que le récitateur récite, le verset en cours est mis en évidence et
la page du mushaf (604 pages, pagination madinoise) se tourne toute seule.

Le texte, la pagination et les minutages sont **embarqués dans
l'application** : la lecture du Coran fonctionne hors ligne. Seul l'audio
est diffusé depuis les serveurs des fournisseurs de récitation.

## État vérifié

```
$ npm test
# tests 27
# pass 27
# fail 0

$ npm run check
(aucune sortie : aucune erreur de type)
```

Les 27 épreuves tournent sur les **données réelles** (6236 versets,
604 pages, 40 récitateurs), pas sur des données de laboratoire. Le contrôle
de types couvre tout le projet, y compris le lecteur audio, contre les
définitions réellement installées.

L'épreuve de contrat a été **falsifiée** avant d'être retenue : en
renommant `arabicTitle` dans les données, elle échoue en désignant le bon
champ. Un test qu'on n'a pas vu échouer ne prouve rien.

## Ce qui est fait, et ce qui reste

| Élément | État |
|---|---|
| Texte uthmani + pagination 604 pages | extrait et vérifié |
| Minutages de 40 récitateurs, normalisés | extrait et vérifié |
| Logique de synchronisation verset par verset | écrite, 27 tests verts |
| Contrat entre les données livrées et l'écran | écrit, 8 tests verts |
| Rendu de la page, surlignage, défilement | écrit, types vérifiés |
| Lecteur audio (expo-audio) | écrit, types vérifiés, non entendu sur appareil |
| Compilation en IPA non signé | script écrit + chemin GitHub Actions documenté |
| **IPA produit** | **à lancer depuis macOS ou GitHub Actions** |

## Pourquoi l'IPA ne peut pas être produit ici

Ce projet a été assemblé sous Windows. La compilation d'un IPA exige **Xcode**,
qui n'existe que sous macOS. Aucun outil ne permet de contourner cela depuis
Windows : ce n'est pas une limitation de configuration, c'est une contrainte
d'Apple.

### Ce qu'il ne faut PAS faire : `eas build`

`eas build --platform ios` **exige des identifiants de signature Apple** et
produit un IPA **signé**. Il n'existe pas de profil EAS qui rende un IPA non
signé. Passer par EAS pour ensuite le faire re-signer est un détour inutile.

### Le bon chemin : GitHub Actions, qui compile sans signer

Un runner **macOS** de GitHub Actions compile avec la vraie chaîne d'outils —
`expo prebuild`, CocoaPods, `xcodebuild` — en désactivant explicitement la
signature :

```
xcodebuild ... CODE_SIGNING_ALLOWED=NO
```

Ce qui sort est un **authentique IPA non signé**, exactement ce qu'attend un
service de signature. Aucun Mac local, aucun compte Apple Developer.

Dépôt de référence (MIT, générique, réutilisable pour n'importe quel projet
Expo) : <https://github.com/adro0303/ipa-builder>

```bash
# dans votre copie d'ipa-builder
gh workflow run build-ipa.yml --repo VOTRE-COMPTE/ipa-builder \
  -f repo=VOTRE-COMPTE/coran-memoire-reader \
  -f ref=main \
  -f app_dir=. \
  -f ipa_name=coran-memoire-reader-unsigned
```

Compter 10 à 15 min. L'IPA se récupère dans **Artifacts** du run (conservé
14 jours). Attention : un runner macOS consomme les minutes GitHub Actions
**10×**.

### Sur un Mac local (si vous en avez un)

`./build-ipa.sh` fait tout — épreuves, types, puis compilation :

```bash
npm install
python tools/fetch_font.py ~/chemin/vers/AlKetab.ipa
./build-ipa.sh
```

Produit `coran-memoire-reader-unsigned.ipa`, à signer avec votre service.

> Dans tous les cas, `tools/fetch_font.py` doit avoir tourné avant : la
> police n'est pas versionnée (voir « Police » plus bas).

## Architecture

```
src/reader/
  sync.ts               minutages -> verset mis en évidence   (pur, testé)
  navigation.ts         verset <-> page <-> sourate           (pur, testé)
  MushafReader.tsx      rendu de la page, défilement
  useQuranPlayer.ts     assemble audio + minutages + affichage
  audioEngine.ts        SEUL fichier qui parle à expo-audio
src/app/
  App.tsx               racine, chargement de la police
  ReaderScreen.tsx      écran : barre, mushaf, lecteur, sélecteurs
assets/data/
  quran.json            114 sourates, 604 pages, 6236 versets
  reciters.json         40 récitateurs + minutages
tools/
  extract_quran.py      reconstruit quran.json depuis une source
  extract_reciters.py   reconstruit reciters.json depuis une source
  fetch_font.py         copie la police depuis un IPA local
```

`sync.ts` et `navigation.ts` sont **purs** : ni React, ni réseau, ni audio.
C'est ce qui permet de les éprouver sur les 604 pages sans monter d'interface.

`audioEngine.ts` est le seul point de contact avec le son. Toute la logique
est testable en remplaçant cette couche — c'est délibéré.

## Données embarquées

**`quran.json`** — 604 pages. Chaque page porte son juz, les sourates dont le
cartouche doit apparaître en tête, et ses versets en écriture uthmanienne
(Hafs). La pagination est celle du mushaf madinois : la page 1 contient
Al-Fâtiha entière, la page 2 commence à Al-Baqarah 1.

**`reciters.json`** — 40 récitateurs, 248 401 versets minutés. Trois
conventions d'indexation coexistaient dans la source (base 1, base 0,
mixte) ; elles ont été ramenées à une seule. Les préambules (`ayah: 0` —
isti'adha ou basmala) sont stockés à part, dans `openings`.

7 récitateurs sur 40 ont des sourates inexploitables (14 sourates au total) :
leurs minutages sont absents plutôt que faux, et le lecteur ne surligne rien
pour ces sourates. Mieux vaut un silence qu'un surlignage qui saute.

## Police

`UthmanicHafs.ttf` (KFGQPC) est **nécessaire** et **non distribué** ici.

Sa licence autorise l'usage et la distribution gratuits, mais interdit la
vente et la modification. Elle est donc absente du dépôt et ajoutée
localement avant compilation :

```bash
python tools/fetch_font.py <chemin/vers/source.ipa>
```

Le texte de licence complet est dans
`assets/fonts/LICENSE-UthmanicHafs.txt`.

Alternative sans contrainte : `UthmanicHafs_V22.ttf`, également présent dans
la source, si vous préférez une version plus récente du dessin.

## Licence et droits

Le texte coranique, sa pagination et les minutages proviennent de la source
fournie par le demandeur, qui déclare en détenir les droits. Les récitations
sont diffusées depuis les serveurs publics des fournisseurs (MP3Quran,
QuranicAudio, Quran.com) et restent soumises à leurs conditions.
