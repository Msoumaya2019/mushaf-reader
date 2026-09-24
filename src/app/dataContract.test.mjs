/**
 * Accord entre les donnees embarquees et ce que l'ecran en attend.
 *
 * Les epreuves de `sync` et `navigation` portent sur la logique. Celle-ci
 * porte sur le contrat : les fichiers reellement importes par l'ecran
 * contiennent-ils les champs que les composants lisent ?
 *
 * C'est le genre d'ecart qui ne se voit qu'a l'ecran : un champ renomme
 * quelque part produit un `undefined` silencieux dans un rendu, jamais une
 * erreur. On le fixe donc ici, en dur, sur les fichiers livres.
 *
 *   node --test src/app/dataContract.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "..", "assets", "data");

const quran = JSON.parse(readFileSync(join(assets, "quran.json"), "utf8"));
const reciters = JSON.parse(readFileSync(join(assets, "reciters.json"), "utf8"));

test("quran.json porte les trois listes attendues", () => {
  assert.ok(Array.isArray(quran.surahs), "surahs");
  assert.ok(Array.isArray(quran.juzs), "juzs");
  assert.ok(Array.isArray(quran.pages), "pages");
  assert.equal(quran.pages.length, 604);
  assert.equal(quran.surahs.length, 114);
});

test("chaque page porte les champs lus par MushafReader", () => {
  for (const p of quran.pages) {
    assert.equal(typeof p.number, "number", `page ${p.number}: number`);
    assert.equal(typeof p.juz, "number", `page ${p.number}: juz`);
    assert.ok(Array.isArray(p.headerSurahs), `page ${p.number}: headerSurahs`);
    assert.ok(Array.isArray(p.verses), `page ${p.number}: verses`);
    assert.ok(p.verses.length > 0, `page ${p.number}: au moins un verset`);
    for (const v of p.verses) {
      assert.equal(typeof v.surah, "number");
      assert.equal(typeof v.ayah, "number");
      assert.equal(typeof v.uthmani, "string");
    }
  }
});

test("chaque sourate porte les champs lus par le cartouche", () => {
  for (const s of quran.surahs) {
    assert.equal(typeof s.number, "number", "number");
    assert.equal(typeof s.arabicTitle, "string", `sourate ${s.number}: arabicTitle`);
    assert.equal(typeof s.englishTitle, "string", `sourate ${s.number}: englishTitle`);
    assert.equal(typeof s.verseCount, "number", `sourate ${s.number}: verseCount`);
    assert.equal(typeof s.firstPage, "number", `sourate ${s.number}: firstPage`);
    assert.equal(typeof s.isMeccan, "boolean", `sourate ${s.number}: isMeccan`);
  }
});

test("les pages se suivent de 1 a 604 sans trou", () => {
  quran.pages.forEach((p, i) => {
    assert.equal(p.number, i + 1, `position ${i}`);
  });
});

test("chaque recitateur porte les champs lus par le lecteur", () => {
  assert.equal(reciters.reciters.length, 40);
  for (const r of reciters.reciters) {
    assert.equal(typeof r.id, "number", "id");
    assert.equal(typeof r.name, "string", `${r.id}: name`);
    assert.equal(typeof r.nameEn, "string", `${r.id}: nameEn`);
    assert.equal(typeof r.folderUrl, "string", `${r.id}: folderUrl`);
    assert.ok(r.folderUrl.startsWith("https://"), `${r.id}: folderUrl en https`);
    assert.equal(typeof r.format, "string", `${r.id}: format`);
    assert.ok(/%0?\d*d/.test(r.format), `${r.id}: format porte un gabarit`);
    assert.equal(r.timings.length, 114, `${r.id}: 114 entrees de timings`);
    assert.equal(r.openings.length, 114, `${r.id}: 114 preambules`);
    assert.ok(Array.isArray(r.brokenSurahs), `${r.id}: brokenSurahs`);
  }
});

test("les minutages sont croissants et non vides la ou annonces", () => {
  for (const r of reciters.reciters) {
    const broken = new Set(r.brokenSurahs);
    for (let s = 1; s <= 114; s++) {
      const row = r.timings[s - 1];
      if (broken.has(s)) {
        assert.equal(row.length, 0, `${r.id} sourate ${s}: ecartee donc vide`);
        continue;
      }
      assert.ok(row.length > 0, `${r.id} sourate ${s}: non vide`);
      for (let i = 1; i < row.length; i++) {
        assert.ok(
          row[i][0] >= row[i - 1][1],
          `${r.id} sourate ${s} verset ${i + 1}: debut avant la fin du precedent`,
        );
      }
    }
  }
});

test("le premier verset de chaque sourate a une page valide", () => {
  // L'ecran appelle `firstPageOfSurah` avant meme de charger une page : si
  // cette valeur sortait de l'intervalle, l'ecran afficherait "introuvable"
  // au demarrage.
  for (const s of quran.surahs) {
    assert.ok(
      s.firstPage >= 1 && s.firstPage <= 604,
      `sourate ${s.number}: firstPage ${s.firstPage} hors bornes`,
    );
  }
});

test("la police attendue est presente et non vide", () => {
  const font = join(here, "..", "..", "assets", "fonts", "UthmanicHafs.ttf");
  const buf = readFileSync(font);
  assert.ok(buf.length > 100_000, `police trop petite : ${buf.length} octets`);
  // Un TTF commence par la version en 4 octets : 0x00010000 pour TrueType.
  assert.equal(buf.readUInt32BE(0), 0x00010000, "en-tete TrueType");
  const tables = buf.readUInt16BE(4);
  assert.ok(tables > 5, `nombre de tables suspect : ${tables}`);
});
