/**
 * Implementation reelle de `AudioEngine` au-dessus d'expo-audio.
 *
 * Le reste du lecteur ne connait que l'interface `AudioEngine` ; ce fichier
 * est le seul endroit qui parle a la bibliotheque audio. C'est ce qui permet
 * d'eprouver toute la logique de synchronisation sans appareil ni son.
 *
 * L'API d'expo-audio est asynchrone et ne signale la fin d'une piste que par
 * un evenement : on ne l'interroge pas, on l'ecoute. La position, elle, n'est
 * publiee qu'a la cadence demandee a la creation du lecteur.
 */

import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus as ExpoAudioStatus,
} from "expo-audio";

import type { AudioEngine, AudioStatus } from "./useQuranPlayer";

/**
 * Cadence de publication de la position, en millisecondes.
 *
 * C'est `updateInterval` du lecteur natif, pas une boucle cote JS : quatre
 * fois par seconde suffisent a un surlignage qui parait continu, et cela
 * evite de franchir le pont natif pour rien.
 */
const UPDATE_INTERVAL_MS = 250;

export function createEngine(
  onStatus: (status: AudioStatus) => void,
): AudioEngine {
  let player: AudioPlayer | null = null;
  let subscription: { remove(): void } | null = null;
  /** La fin de piste est un evenement : on la retient jusqu'a la prochaine emission. */
  let ended = false;
  let lastUrl: string | null = null;

  // La lecture doit continuer ecran eteint et en arriere-plan : c'est le
  // cas d'usage normal d'une recitation qu'on ecoute en memorisant.
  void setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: "doNotMix",
  });

  const emit = () => {
    if (!player) {
      onStatus({ positionMs: 0, playing: false, didJustFinish: false });
      return;
    }
    const positionMs = Math.round((player.currentTime ?? 0) * 1000);
    // `didJustFinish` n'est signale qu'une seule fois, sinon le lecteur
    // enchainerait plusieurs fois sur la sourate suivante.
    const didJustFinish = ended;
    ended = false;
    onStatus({ positionMs, playing: player.playing, didJustFinish });
  };

  const teardown = () => {
    subscription?.remove();
    subscription = null;
    if (player) {
      player.remove();
      player = null;
    }
    lastUrl = null;
  };

  return {
    play(url: string) {
      // Recharger la meme URL redemarrerait la sourate depuis le debut a
      // chaque rendu : on ne remplace le lecteur que si la piste change.
      if (player && lastUrl === url) {
        player.play();
        return;
      }

      teardown();
      ended = false;
      lastUrl = url;

      player = createAudioPlayer({ uri: url }, { updateInterval: UPDATE_INTERVAL_MS });
      subscription = player.addListener(
        "playbackStatusUpdate",
        (status: ExpoAudioStatus) => {
          if (status.didJustFinish) ended = true;
          emit();
        },
      );
      player.play();
    },

    pause() {
      player?.pause();
      // Une pause explicite n'est pas une fin de piste : on ne doit pas
      // enchainer sur la sourate suivante.
      ended = false;
      emit();
    },

    seek(ms: number) {
      player?.seekTo(ms / 1000);
      emit();
    },

    destroy() {
      teardown();
    },
  };
}
