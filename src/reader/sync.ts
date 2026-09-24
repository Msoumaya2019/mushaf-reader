/**
 * Logique de synchronisation du lecteur de mushaf.
 *
 * Le principe : le temps de lecture audio (en millisecondes) est la seule
 * source de verite. A chaque avancee, on cherche a quel segment il
 * correspond, et on en deduit le verset a mettre en evidence.
 *
 * Ce module est volontairement pur -- aucune dependance a React, a un
 * lecteur audio, ni au reseau. C'est ce qui permet de l'eprouver sur des
 * donnees reelles sans monter d'interface.
 */

/** Bornes de temps d'un segment, en millisecondes. */
export type Span = readonly [start: number, end: number];

/** Timings d'un recitateur, tels que produits par tools/extract_reciters.py. */
export interface ReciterTimings {
  /** timings[sourate - 1][verset - 1] = [debut, fin] ; vide si ecartee. */
  timings: ReadonlyArray<ReadonlyArray<Span>>;
  /** openings[sourate - 1] = preambule (isti'adha / basmala), ou null. */
  openings: ReadonlyArray<Span | null>;
  /** Numeros des sourates dont la source etait incoherente. */
  brokenSurahs: readonly number[];
}

/** Ce que la lecture courante met en evidence. */
export interface Highlight {
  /** Numero de sourate, 1 a 114. */
  surah: number;
  /** Numero de verset, 1 a n. 0 designe le preambule de la sourate. */
  ayah: number;
}

/**
 * Le dernier segment surlignable se termine-t-il a cet instant ?
 *
 * Sert a decider d'un enchainement : quand la lecture atteint la fin d'une
 * sourate, le lecteur doit pouvoir passer a la suivante sans attendre que
 * l'utilisateur relance quoi que ce soit.
 */
export function isAtEnd(
  reciter: ReciterTimings,
  surah: number,
  time: number,
): boolean {
  const row = reciter.timings[surah - 1];
  if (!row || row.length === 0) return false;
  const last = row[row.length - 1];
  // Un dernier segment repare porte une duree nulle : on le traite comme
  // une fin immediate, sinon la lecture ne progresserait jamais au-dela.
  return last[1] <= last[0] ? time >= last[0] : time >= last[1];
}

/**
 * Determine le segment mis en evidence a l'instant `time`, dans la sourate
 * `surah`.
 *
 * On cherche par dichotomie : les timings sont croissants, donc une
 * recherche lineaire serait lineaire en nombre de versets (jusqu'a 286 pour
 * Al-Baqarah) a chaque rafraichissement -- ce qui s'entend sur un appareil
 * modeste.
 *
 * Renvoie null si la sourate est ecartee, si le temps sort de la plage, ou
 * si `time` designe un silence entre deux versets.
 */
export function highlightAt(
  reciter: ReciterTimings,
  surah: number,
  time: number,
): Highlight | null {
  const row = reciter.timings[surah - 1];
  if (!row || row.length === 0) return null;

  const opening = reciter.openings[surah - 1];

  // Le preambule precede toujours le verset 1 : on le teste d'abord, il est
  // hors du tableau `row` et ne decale donc aucun index.
  if (opening && time >= opening[0] && time < opening[1]) {
    return { surah, ayah: 0 };
  }

  let lo = 0;
  let hi = row.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = row[mid];
    if (time < start) {
      hi = mid - 1;
    } else if (time >= end) {
      lo = mid + 1;
    } else {
      return { surah, ayah: mid + 1 };
    }
  }

  // Aucun segment ne contient `time` : silence, ou fin d'une sourate dont
  // le dernier verset a ete repare (duree nulle).
  return null;
}

/** Limite la valeur d'un numero de sourate a l'intervalle valide. */
export function clampSurah(surah: number): number {
  if (surah < 1) return 1;
  if (surah > 114) return 114;
  return surah;
}

/**
 * Construit l'URL du fichier audio d'une sourate.
 *
 * Deux gabarits ont ete observes dans la source :
 *   - `%d.mp3`   : numero sans remplissage (1 -> "1.mp3")
 *   - `%03d.mp3` : numero sur trois chiffres (1 -> "001.mp3")
 *
 * Le gabarit doit etre applique tel quel : forcer trois chiffres sur un
 * fournisseur qui n'en veut pas donnerait une 404 silencieuse, et c'est
 * le genre d'erreur qui ne se voit qu'a l'ecoute.
 */
export function audioUrl(
  folderUrl: string,
  format: string,
  surah: number,
): string {
  const base = folderUrl.endsWith("/") ? folderUrl : `${folderUrl}/`;
  const name = format.replace(/%0?(\d*)d/, (_match, width: string) => {
    const w = width ? parseInt(width, 10) : 0;
    return w > 0 ? String(surah).padStart(w, "0") : String(surah);
  });
  return `${base}${name}`;
}
