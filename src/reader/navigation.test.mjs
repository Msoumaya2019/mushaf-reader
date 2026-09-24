/**
 * Epreuve de la navigation verset <-> page, sur les vraies 604 pages.
 *
 *   node --experimental-strip-types --test src/reader/navigation.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// Memes fichiers que ceux embarques par l'application : source unique.
const quran = JSON.parse(
  readFileSync(join(here, "..", "..", "assets", "data", "quran.json"), "utf8"),
);
const reciters = JSON.parse(
  readFileSync(join(here, "..", "..", "assets", "data", "reciters.json"), "utf8"),
);

const nav = await import("./navigation.ts");
const sync = await import("./sync.ts");

const pages = quran.pages;

test("le texte couvre les 604 pages et 6236 versets", () => {
  assert.equal(pages.length, 604);
  const total = pages.reduce((n, p) => n + p.verses.length, 0);
  assert.equal(total, 6236);
});

test("chaque page est numerotee dans l'ordre et non vide", () => {
  pages.forEach((p, i) => {
    assert.equal(p.number, i + 1);
    assert.ok(p.verses.length > 0, `page ${p.number} vide`);
  });
});

test("la page d'un verset est retrouvee exactement", () => {
  // On balaie un echantillon representatif : la premiere page, la derniere,
  // et des pages du milieu repartis dans le mushaf.
  const probes = [1, 2, 50, 100, 200, 300, 400, 500, 600, 604];
  for (const n of probes) {
    const page = pages[n - 1];
    for (const v of page.verses) {
      assert.equal(
        nav.pageOfVerse(pages, v.surah, v.ayah),
        n,
        `${v.surah}:${v.ayah} devrait etre page ${n}`,
      );
    }
  }
});

test("le premier verset d'une page est celui annonce", () => {
  for (let n = 1; n <= 604; n++) {
    const expected = pages[n - 1].verses[0];
    const got = nav.firstVerseOfPage(pages, n);
    assert.deepEqual(
      got,
      { surah: expected.surah, ayah: expected.ayah },
      `page ${n}`,
    );
  }
});

test("une page hors bornes ne fait pas planter", () => {
  assert.deepEqual(nav.firstVerseOfPage(pages, 0), { surah: 1, ayah: 1 });
  assert.deepEqual(nav.firstVerseOfPage(pages, 999), { surah: 1, ayah: 1 });
});

test("les versets sont contigus d'une page a la suivante", () => {
  // Propriete structurante du mushaf : aucune page ne saute un verset, et
  // aucune ne le repete. Si elle etait fausse, le suivi sauterait des
  // versets au passage de page.
  let prev = null;
  for (const page of pages) {
    for (const v of page.verses) {
      if (prev) {
        const sameSurah = v.surah === prev.surah;
        assert.ok(
          (sameSurah && v.ayah === prev.ayah + 1) ||
            (v.surah === prev.surah + 1 && v.ayah === 1),
          `rupture entre ${prev.surah}:${prev.ayah} et ${v.surah}:${v.ayah}`,
        );
      }
      prev = v;
    }
  }
});

test("chaque recitateur couvre bien tout le texte, hors sourates ecartees", () => {
  const { versesPerSurah, reciters: list } = reciters;
  for (const r of list) {
    for (let s = 1; s <= 114; s++) {
      const row = r.timings[s - 1];
      if (r.brokenSurahs.includes(s)) {
        assert.equal(row.length, 0, `${r.nameEn}: sourate ${s} devrait etre vide`);
        continue;
      }
      assert.equal(
        row.length,
        versesPerSurah[s - 1],
        `${r.nameEn}: sourate ${s}`,
      );
    }
  }
});

test("le surlignage d'un verset tombe sur une page existante", () => {
  // On eprouve l'ensemble du parcours sur un recitateur propre.
  const r = reciters.reciters.find((x) => x.id === 7);
  let checked = 0;

  for (let s = 1; s <= 114; s++) {
    const row = r.timings[s - 1];
    if (row.length === 0) continue;
    for (let v = 0; v < row.length; v++) {
      const start = row[v][0];
      const h = sync.highlightAt(r, s, start);
      assert.ok(h, `sourate ${s} verset ${v + 1}: aucun surlignage`);
      const page = nav.pageOfVerse(pages, h.surah, h.ayah);
      assert.ok(
        page >= 1 && page <= 604,
        `sourate ${s} verset ${v + 1}: page ${page} hors bornes`,
      );
      checked++;
    }
  }

  // Le recitateur retenu a une sourate ecartee : on attend donc le total
  // canonique moins les versets de cette sourate, et non 6236.
  const missing = r.brokenSurahs.reduce(
    (n, s) => n + reciters.versesPerSurah[s - 1],
    0,
  );
  assert.equal(checked, 6236 - missing, "tous les versets couverts doivent etre eprouves");
  assert.ok(missing > 0, "ce recitateur doit bien avoir une sourate ecartee");
});
