/**
 * Racine de l'application.
 *
 * Le theme est aligne sur la palette de l'application d'origine ; la police
 * du mushaf est chargee avant le premier rendu, sinon les premiers versets
 * s'afficheraient dans la police systeme.
 */

import React from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";

import { ReaderScreen } from "./ReaderScreen";

export default function App() {
  // La police Uthmanic Hafs n'est pas redistribuable : elle doit etre
  // deposee manuellement dans assets/fonts avant la compilation.
  const [loaded] = useFonts({
    UthmanicHafs: require("../../assets/fonts/UthmanicHafs.ttf"),
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <ReaderScreen />
    </>
  );
}
