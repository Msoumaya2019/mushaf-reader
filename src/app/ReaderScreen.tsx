/**
 * Ecran de lecture du mushaf.
 *
 * Assemble les trois briques deja eprouvees :
 *   - `MushafReader`      : rendu de la page (texte uthmani, cartouches) ;
 *   - `useQuranPlayer`    : position audio -> verset mis en evidence ;
 *   - `audioEngine`       : la seule piece qui touche au son.
 *
 * Aucune logique de synchronisation n'est reimplementee ici : tout vient des
 * modules testes, ce qui evite que l'ecran et les tests divergent.
 */

import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { MushafReader, type MushafPage, type ReaderTheme, type SurahMeta } from "../reader/MushafReader";
import { createEngine } from "../reader/audioEngine";
import { useQuranPlayer, type Reciter } from "../reader/useQuranPlayer";
import { toArabicDigits } from "../reader/MushafReader";

import quranData from "../../assets/data/quran.json";
import recitersData from "../../assets/data/reciters.json";

const PAGES = quranData.pages as unknown as MushafPage[];
const SURAHS = quranData.surahs as unknown as SurahMeta[];
const RECITERS = (recitersData as unknown as { reciters: Reciter[] }).reciters;

const THEME: ReaderTheme = {
  background: "#FBF7EF",
  surface: "#FFFFFF",
  text: "#1F2933",
  muted: "#7B8794",
  accent: "#0E7C66",
  highlight: "#E4F2EC",
  border: "#E3DCCB",
};

export function ReaderScreen() {
  const [reciterIndex, setReciterIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [surahPickerOpen, setSurahPickerOpen] = useState(false);

  const reciter = RECITERS[reciterIndex];

  // `createEngine` doit garder son identite entre deux rendus, sinon le hook
  // reconstruirait le lecteur a chaque frappe.
  const memoCreateEngine = useMemo(() => createEngine, []);

  const {
    surah,
    currentPage,
    highlight,
    playing,
    play,
    pause,
    seekToVerse,
    goToSurah,
  } = useQuranPlayer({
    reciter,
    pages: PAGES,
    surahs: SURAHS,
    createEngine: memoCreateEngine,
  });

  const page = PAGES[currentPage - 1];
  const surahMeta = SURAHS[surah - 1];

  if (!page) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>Page introuvable</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => setSurahPickerOpen(true)} style={styles.chip}>
          <Text style={styles.chipText}>
            {surahMeta.arabicTitle} · {toArabicDigits(surah)}
          </Text>
        </Pressable>
        <Pressable onPress={() => setPickerOpen(true)} style={styles.chip}>
          <Text style={styles.chipText} numberOfLines={1}>
            {reciter.nameEn}
          </Text>
        </Pressable>
      </View>

      <MushafReader
        page={page}
        surahs={SURAHS}
        theme={THEME}
        highlight={highlight}
        following={playing}
      />

      <View style={styles.bottomBar}>
        <Pressable
          onPress={playing ? pause : play}
          style={[styles.playButton, playing && styles.playButtonActive]}
        >
          <Text style={styles.playText}>{playing ? "إيقاف" : "تشغيل"}</Text>
        </Pressable>

        <Pressable
          onPress={() => seekToVerse(highlight?.ayah && highlight.ayah > 1 ? highlight.ayah : 1)}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>من أول السورة</Text>
        </Pressable>

        <Text style={styles.counter}>
          {toArabicDigits(currentPage)} / {toArabicDigits(604)}
        </Text>
      </View>

      <PickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="القارئ"
        items={RECITERS.map((r, i) => ({
          key: String(r.id),
          label: r.name,
          sub: `${r.nameEn} · ${r.rewaya}`,
          selected: i === reciterIndex,
          onPress: () => {
            setReciterIndex(i);
            setPickerOpen(false);
          },
        }))}
      />

      <PickerSheet
        visible={surahPickerOpen}
        onClose={() => setSurahPickerOpen(false)}
        title="السورة"
        items={SURAHS.map((s) => ({
          key: String(s.number),
          label: `${toArabicDigits(s.number)}. ${s.arabicTitle}`,
          sub: `${s.englishTitle} · ${s.verseCount} آية`,
          selected: s.number === surah,
          onPress: () => {
            goToSurah(s.number);
            setSurahPickerOpen(false);
          },
        }))}
      />
    </View>
  );
}

interface PickerItem {
  key: string;
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
}

function PickerSheet({
  visible,
  onClose,
  title,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: PickerItem[];
}): React.ReactElement {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable onPress={onClose} style={styles.chip}>
            <Text style={styles.chipText}>إغلاق</Text>
          </Pressable>
        </View>
        <ScrollView>
          {items.map((it) => (
            <Pressable
              key={it.key}
              onPress={it.onPress}
              style={[styles.row, it.selected && styles.rowSelected]}
            >
              <Text style={styles.rowLabel}>{it.label}</Text>
              <Text style={styles.rowSub}>{it.sub}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: THEME.background },
  topBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 56,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.surface,
  },
  chipText: { color: THEME.text, fontSize: 14 },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    backgroundColor: THEME.surface,
  },
  playButton: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: THEME.accent,
  },
  playButtonActive: { backgroundColor: "#B2413B" },
  playText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  secondary: { paddingHorizontal: 12, paddingVertical: 12 },
  secondaryText: { color: THEME.accent, fontSize: 15 },
  counter: { marginLeft: "auto", color: THEME.muted, fontSize: 14 },
  muted: { color: THEME.muted, padding: 24 },
  sheet: { flex: 1, backgroundColor: THEME.background, paddingTop: 56 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sheetTitle: { fontSize: 20, color: THEME.text },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  rowSelected: { backgroundColor: THEME.highlight },
  rowLabel: { fontSize: 17, color: THEME.text, writingDirection: "rtl" },
  rowSub: { marginTop: 2, fontSize: 13, color: THEME.muted },
});
