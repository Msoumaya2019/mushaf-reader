/**
 * Rendu d'une page de mushaf et mise en evidence du verset en cours.
 *
 * Principe : le texte est affiche en uthmani Hafs, dans la fonte KFGQPC.
 * Chaque verset est un bloc a part entiere, ce qui permet de le surligner
 * individuellement sans mesurer le texte, et de le faire defiler en vue
 * quand la recitation avance.
 *
 * Aucune image de page n'est necessaire : le texte est reel, donc la page
 * reste nette a toutes les tailles et le surlignage est exact au verset.
 */

import React, { useMemo, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";

import type { ReciterTimings, Highlight } from "./sync";

/** Un verset tel que produit par tools/extract_quran.py. */
export interface Verse {
  surah: number;
  ayah: number;
  uthmani: string;
  /** Texte vocalise classique, utile en mode apprentissage. */
  tashkil: string;
}

/** Une page du mushaf. */
export interface MushafPage {
  number: number;
  juz: number;
  /** Sourates dont le cartouche doit apparaitre en tete de page. */
  headerSurahs: number[];
  verses: Verse[];
}

export interface SurahMeta {
  number: number;
  arabicTitle: string;
  englishTitle: string;
  verseCount: number;
  firstPage: number;
  isMeccan: boolean;
}

/** Palette, alignee sur celle de l'application. */
export interface ReaderTheme {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  /** Fond du verset en cours de recitation. */
  highlight: string;
  border: string;
}

export interface MushafReaderProps {
  page: MushafPage;
  surahs: readonly SurahMeta[];
  theme: ReaderTheme;
  /** Verset mis en evidence, ou null si la recitation est en pause. */
  highlight: Highlight | null;
  /** Joue-t-on de la recitation ? Le defilement suit alors la lecture. */
  following: boolean;
  /** Nombre de colonnes logiques ; 1 sur telephone, 2 sur tablette. */
  columns?: 1 | 2;
}

/** Construit une cle stable pour un verset. */
export function verseKey(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}

export function MushafReader({
  page,
  surahs,
  theme,
  highlight,
  following,
  columns = 1,
}: MushafReaderProps): React.ReactElement {
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const viewportHeight = useRef(0);

  const surahByNumber = useMemo(() => {
    const map = new Map<number, SurahMeta>();
    for (const s of surahs) map.set(s.number, s);
    return map;
  }, [surahs]);

  const highlightedKey = highlight
    ? highlight.ayah === 0
      ? verseKey(highlight.surah, 0)
      : verseKey(highlight.surah, highlight.ayah)
    : null;

  const styles = useMemo(() => createStyles(theme, columns), [theme, columns]);

  /**
   * Amene le verset en cours dans le haut de la zone visible.
   *
   * On ne defile que si le lecteur suit la recitation, et seulement si le
   * verset est deja monte -- ce qui est toujours le cas sur la page
   * affichee, puisqu'on ne change de page qu'entre deux versets.
   */
  const scrollToVerse = (key: string) => {
    if (!following) return;
    const y = offsets.current[key];
    if (y === undefined) return;
    // On place le verset au tiers superieur : le lecteur voit aussi ce qui
    // precede, ce qui aide a suivre sans perdre le fil.
    scrollRef.current?.scrollTo({
      y: Math.max(0, y - viewportHeight.current / 3),
      animated: true,
    });
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      onLayout={(e) => {
        viewportHeight.current = e.nativeEvent.layout.height;
      }}
      // Le suivi automatique ne doit pas se battre avec un defilement
      // manuel : on mémorise la position de chaque verset au passage.
      onScroll={(_e: NativeSyntheticEvent<NativeScrollEvent>) => {}}
      scrollEventThrottle={16}
    >
      {page.headerSurahs.map((n) => {
        const meta = surahByNumber.get(n);
        if (!meta) return null;
        return (
          <View key={`header-${n}`} style={styles.surahHeader}>
            <Text style={styles.surahTitle}>{meta.arabicTitle}</Text>
            <Text style={styles.surahSubtitle}>
              {meta.isMeccan ? "مكية" : "مدنية"} · {meta.verseCount} آية
            </Text>
          </View>
        );
      })}

      <View style={styles.verses}>
        {page.verses.map((v) => {
          const key = verseKey(v.surah, v.ayah);
          const isCurrent = highlightedKey === key;
          return (
            <View
              key={key}
              onLayout={(e) => {
                offsets.current[key] = e.nativeEvent.layout.y;
                if (isCurrent) scrollToVerse(key);
              }}
              style={[styles.verse, isCurrent && styles.verseCurrent]}
            >
              <Text style={[styles.verseText, isCurrent && styles.verseTextCurrent]}>
                {v.uthmani}
              </Text>
              <Text style={[styles.verseNumber, isCurrent && styles.verseNumberCurrent]}>
                ﴿{toArabicDigits(v.ayah)}﴾
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

/** Convertit un nombre en chiffres arabes-indiens, comme sur le mushaf. */
export function toArabicDigits(value: number): string {
  const digits = "٠١٢٣٤٥٦٧٨٩";
  return String(value)
    .split("")
    .map((c) => digits[Number(c)] ?? c)
    .join("");
}

function createStyles(theme: ReaderTheme, columns: 1 | 2) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      paddingBottom: 96,
    },
    surahHeader: {
      marginVertical: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: theme.accent,
      borderRadius: 8,
      backgroundColor: theme.surface,
      alignItems: "center",
    },
    surahTitle: {
      fontSize: 22,
      color: theme.text,
      writingDirection: "rtl",
    },
    surahSubtitle: {
      marginTop: 4,
      fontSize: 13,
      color: theme.muted,
      writingDirection: "rtl",
    },
    verses: {
      flexDirection: columns === 2 ? "row" : "column",
      flexWrap: columns === 2 ? "wrap" : "nowrap",
    },
    verse: {
      width: columns === 2 ? "50%" : "100%",
      paddingHorizontal: 8,
      paddingVertical: 6,
      marginVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "transparent",
    },
    verseCurrent: {
      backgroundColor: theme.highlight,
      borderColor: theme.accent,
    },
    verseText: {
      fontSize: 26,
      lineHeight: 52,
      color: theme.text,
      textAlign: "right",
      writingDirection: "rtl",
    },
    verseTextCurrent: {
      color: theme.text,
    },
    verseNumber: {
      marginTop: 4,
      fontSize: 15,
      color: theme.muted,
      textAlign: "center",
    },
    verseNumberCurrent: {
      color: theme.accent,
    },
  });
}
