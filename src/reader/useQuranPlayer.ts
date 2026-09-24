/**
 * Lecteur audio coranique avec suivi du verset en cours.
 *
 * Le composant relie les trois briques : le fichier audio d'une sourate,
 * les timings du recitateur, et le surlignage de la page affichee.
 *
 * Deux points meritaient attention :
 *
 *  - la page affichee doit etre deduite du verset en cours, et non choisie
 *    independamment, sinon l'affichage et la recitation divergent des qu'on
 *    change de page au milieu d'une sourate ;
 *
 *  - le passage a la sourate suivante se fait sur `didJustFinish`, jamais
 *    sur une comparaison de temps : le dernier segment peut porter une
 *    duree nulle quand la source etait corrompue, et une comparaison de
 *    temps ne se declencherait alors jamais.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import type { MushafPage, SurahMeta } from "./MushafReader";
import { firstVerseOfPage, pageOfVerse, type VerseRef } from "./navigation";
import {
  audioUrl,
  clampSurah,
  highlightAt,
  isAtEnd,
  type Highlight,
  type ReciterTimings,
} from "./sync";

/** Un recitateur tel que produit par tools/extract_reciters.py. */
export interface Reciter {
  id: number;
  name: string;
  nameEn: string;
  rewaya: string;
  provider: string;
  folderUrl: string;
  format: string;
  timings: ReciterTimings["timings"];
  openings: ReciterTimings["openings"];
  brokenSurahs: number[];
}

/** Interface minimale d'un lecteur audio, pour rester testable. */
export interface AudioEngine {
  play(url: string): void;
  pause(): void;
  seek(ms: number): void;
  destroy(): void;
}

export interface UseQuranPlayerOptions {
  reciter: Reciter;
  /** Toutes les pages, indexees par numero. */
  pages: readonly MushafPage[];
  surahs: readonly SurahMeta[];
  /** Fabrique le lecteur audio ; permet d'injecter un faux en epreuve. */
  createEngine: (onStatus: (status: AudioStatus) => void) => AudioEngine;
}

export interface AudioStatus {
  /** Position courante en millisecondes. */
  positionMs: number;
  playing: boolean;
  didJustFinish: boolean;
}

export function useQuranPlayer({
  reciter,
  pages,
  surahs,
  createEngine,
}: UseQuranPlayerOptions) {
  const [surah, setSurah] = useState(1);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [currentPage, setCurrentPage] = useState(
    surahs[0]?.firstPage ?? 1,
  );

  const engineRef = useRef<AudioEngine | null>(null);
  const surahRef = useRef(surah);
  surahRef.current = surah;

  // Le lecteur audio est construit une fois et detruit au demontage.
  useEffect(() => {
    const engine = createEngine((status) => {
      setPositionMs(status.positionMs);
      setPlaying(status.playing);
      if (status.didJustFinish) {
        // Enchainement sur la sourate suivante, en s'arretant a la fin.
        setSurah((s) => {
          const next = s + 1;
          if (next > 114) return 114;
          return next;
        });
      }
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [createEngine]);

  // Chargement de la sourate courante des qu'elle change.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const url = audioUrl(reciter.folderUrl, reciter.format, surah);
    engine.play(url);
    setPositionMs(0);
  }, [surah, reciter]);

  // Calcul du verset a chaque avancee du temps de lecture.
  useEffect(() => {
    const h = highlightAt(reciter, surah, positionMs);
    setHighlight(h);
    if (h) {
      setCurrentPage((prev) => {
        const next = pageOfVerse(pages, h.surah, h.ayah);
        return next === prev ? prev : next;
      });
    }
  }, [positionMs, surah, reciter, pages]);

  const play = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.play(audioUrl(reciter.folderUrl, reciter.format, surahRef.current));
  }, [reciter]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const seekToVerse = useCallback(
    (ayah: number) => {
      const row = reciter.timings[surahRef.current - 1];
      const span = row?.[ayah - 1];
      if (!span) return;
      engineRef.current?.seek(span[0]);
    },
    [reciter],
  );

  const goToSurah = useCallback((n: number) => {
    setSurah(clampSurah(n));
  }, []);

  // Une recitation mise en pause par l'application doit reprendre au
  // retour au premier plan plutot que rester silencieusement arretee.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active" && engineRef.current) {
        // On ne coupe pas le son : l'audio continue en arriere-plan.
        return;
      }
    });
    return () => sub.remove();
  }, []);

  const finished = useMemo(
    () => isAtEnd(reciter, surah, positionMs),
    [reciter, surah, positionMs],
  );

  return {
    surah,
    currentPage,
    highlight,
    positionMs,
    playing,
    finished,
    play,
    pause,
    seekToVerse,
    goToSurah,
  };
}
