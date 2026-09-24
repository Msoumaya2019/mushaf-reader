/**
 * Navigation dans le mushaf : traduction entre versets, pages et sourates.
 *
 * Ce module est volontairement pur -- aucune dependance a React ni au
 * lecteur audio. C'est ce qui permet de l'eprouver sur les 604 pages
 * reelles sans monter d'interface.
 */

import type { MushafPage, SurahMeta } from "./MushafReader";

/** Reference d'un verset. */
export interface VerseRef {
  surah: number;
  ayah: number;
}

/** Traduit un couple (sourate, verset) en page de mushaf. */
export function pageOfVerse(
  pages: readonly MushafPage[],
  surah: number,
  ayah: number,
): number {
  for (const page of pages) {
    for (const v of page.verses) {
      if (v.surah === surah && v.ayah === ayah) return page.number;
    }
  }
  return 1;
}

/** Traduit un numero de page en premier verset qu'elle contient. */
export function firstVerseOfPage(
  pages: readonly MushafPage[],
  page: number,
): VerseRef {
  const found = pages[page - 1];
  if (!found || found.verses.length === 0) return { surah: 1, ayah: 1 };
  const v = found.verses[0];
  return { surah: v.surah, ayah: v.ayah };
}

/** Traduit un numero de sourate en premiere page ou elle apparait. */
export function firstPageOfSurah(
  surahs: readonly SurahMeta[],
  surah: number,
): number {
  const meta = surahs[surah - 1];
  return meta ? meta.firstPage : 1;
}
