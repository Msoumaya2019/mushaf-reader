/**
 * Epreuve de la logique de synchronisation sur les donnees reelles.
 *
 * Aucun cadre de test n'est requis : le module sous test est pur, donc on
 * peut l'exercer directement avec node:test et l'executeur integre a Node.
 *
 *   node --test src/reader/sync.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// Les epreuves lisent les memes fichiers que ceux que l'application
// embarque : une seule copie, donc aucune chance que les deux divergent.
const data = JSON.parse(
  readFileSync(join(here, "..", "..", "assets", "data", "reciters.json"), "utf8"),
);

const mod = await import("./sync.ts");

test("les donnees sont completes et homogenes", () => {
  assert.equal(data.reciters.length, 40);
  assert.equal(data.versesPerSurah.length, 114);

  for (const r of data.reciters) {
    assert.equal(r.timings.length, 114, `${r.nameEn}: nombre de sourates`);
    assert.equal(r.openings.length, 114, `${r.nameEn}: nombre de preambules`);
  }
});

test("chaque sourate exploitable a exactement le nombre canonique de versets", () => {
  for (const r of data.reciters) {
    for (let i = 0; i < 114; i++) {
      const row = r.timings[i];
      if (row.length === 0) {
        // Une sourate vide doit etre declaree comme ecartee, sans exception.
        assert.ok(
          r.brokenSurahs.includes(i + 1),
          `${r.nameEn}: sourate ${i + 1} vide mais non declaree`,
        );
        continue;
      }
      assert.equal(
        row.length,
        data.versesPerSurah[i],
        `${r.nameEn}: sourate ${i + 1}`,
      );
      assert.ok(
        !r.brokenSurahs.includes(i + 1),
        `${r.nameEn}: sourate ${i + 1} declaree ecartee mais presente`,
      );
    }
  }
});

test("les timings progressent sans recul", () => {
  for (const r of data.reciters) {
    for (let i = 0; i < 114; i++) {
      const row = r.timings[i];
      for (let v = 1; v < row.length; v++) {
        assert.ok(
          row[v][0] >= row[v - 1][1],
          `${r.nameEn}: sourate ${i + 1} verset ${v + 1} recule`,
        );
      }
    }
  }
});

test("le surlignage suit le verset attendu a chaque instant", () => {
  const r = data.reciters.find((x) => x.id === 7);

  // Al-Fatiha : le verset n occupe [timings[n-1][0], timings[n-1][1]).
  const fatiha = r.timings[0];
  for (let v = 0; v < fatiha.length; v++) {
    const [start, end] = fatiha[v];
    // Le debut et le milieu tombent dans le verset v+1.
    assert.deepEqual(
      mod.highlightAt(r, 1, start),
      { surah: 1, ayah: v + 1 },
      `debut du verset ${v + 1}`,
    );
    assert.deepEqual(
      mod.highlightAt(r, 1, Math.floor((start + end) / 2)),
      { surah: 1, ayah: v + 1 },
      `milieu du verset ${v + 1}`,
    );
    // La borne de fin appartient deja au verset suivant. Sur le dernier
    // verset de la sourate, elle designe la fin : plus rien a surligner.
    const atEnd = mod.highlightAt(r, 1, end);
    if (v === fatiha.length - 1) {
      assert.equal(atEnd, null, "apres le dernier verset, plus de surlignage");
    } else {
      assert.equal(atEnd.ayah, v + 2, `fin du verset ${v + 1}`);
    }
  }
});

test("Al-Baqarah, la plus longue, reste exacte sur toute sa duree", () => {
  const r = data.reciters.find((x) => x.id === 7);
  const row = r.timings[1];
  assert.equal(row.length, 286);

  for (let v = 0; v < row.length; v++) {
    const [start, end] = row[v];
    const got = mod.highlightAt(r, 2, start);
    assert.deepEqual(got, { surah: 2, ayah: v + 1 }, `verset ${v + 1}`);
    if (end > start) {
      const mid = mod.highlightAt(r, 2, end - 1);
      assert.deepEqual(mid, { surah: 2, ayah: v + 1 }, `fin du verset ${v + 1}`);
    }
  }
});

test("le preambule est distingue du premier verset", () => {
  // id 5 possede un preambule sur Al-Fatiha (l'isti'adha).
  const r = data.reciters.find((x) => x.id === 5);
  const opening = r.openings[0];
  assert.ok(opening, "un preambule est attendu sur Al-Fatiha");

  assert.deepEqual(
    mod.highlightAt(r, 1, opening[0]),
    { surah: 1, ayah: 0 },
    "le preambule doit etre designe par ayah 0",
  );
  // Le premier verset commence exactement ou le preambule finit.
  assert.deepEqual(
    mod.highlightAt(r, 1, opening[1]),
    { surah: 1, ayah: 1 },
    "le verset 1 doit suivre le preambule sans recouvrement",
  );
});

test("un recitateur sans preambule n'en invente pas", () => {
  const r = data.reciters.find((x) => x.id === 7);
  assert.equal(r.openings[0], null);
  assert.deepEqual(mod.highlightAt(r, 1, 0), { surah: 1, ayah: 1 });
});

test("une sourate ecartee ne produit aucun surlignage", () => {
  const r = data.reciters.find((x) => x.id === 31);
  assert.ok(r.brokenSurahs.length > 0, "id 31 doit avoir des sourates ecartees");
  for (const s of r.brokenSurahs) {
    assert.equal(
      mod.highlightAt(r, s, 0),
      null,
      `sourate ${s} ecartee doit rester sans surlignage`,
    );
    assert.equal(
      mod.highlightAt(r, s, 1_000_000),
      null,
      `sourate ${s} ecartee doit rester sans surlignage`,
    );
  }
});

test("un temps hors plage ne surligne rien", () => {
  const r = data.reciters.find((x) => x.id === 7);
  assert.equal(mod.highlightAt(r, 1, -1), null);
  assert.equal(mod.highlightAt(r, 1, 999_999_999), null);
});

test("l'URL audio respecte le gabarit du fournisseur", () => {
  // mp3quran publie des noms sur trois chiffres.
  assert.equal(
    mod.audioUrl("https://server8.mp3quran.net/frs_a/", "%03d.mp3", 1),
    "https://server8.mp3quran.net/frs_a/001.mp3",
  );
  assert.equal(
    mod.audioUrl("https://server8.mp3quran.net/frs_a/", "%03d.mp3", 114),
    "https://server8.mp3quran.net/frs_a/114.mp3",
  );
  // quranicaudio publie des noms sans remplissage.
  assert.equal(
    mod.audioUrl("https://download.quranicaudio.com/x/y/", "%d.mp3", 7),
    "https://download.quranicaudio.com/x/y/7.mp3",
  );
  // Un dossier sans barre finale ne doit pas coller le nom au dossier.
  assert.equal(
    mod.audioUrl("https://exemple.tld/a", "%d.mp3", 3),
    "https://exemple.tld/a/3.mp3",
  );
});

test("la fin de sourate est detectable pour enchainer", () => {
  const r = data.reciters.find((x) => x.id === 7);
  const fatiha = r.timings[0];
  const end = fatiha[fatiha.length - 1][1];

  assert.equal(mod.isAtEnd(r, 1, end - 1), false);
  assert.equal(mod.isAtEnd(r, 1, end), true);
  assert.equal(mod.isAtEnd(r, 1, end + 5_000), true);
});
