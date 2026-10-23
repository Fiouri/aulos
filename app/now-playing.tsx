import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { trackFavoriteKey } from '@/collections/favorites';
import { trackArtworkSource } from '@/library/artwork';
import {
  SLEEP_OFF,
  SLEEP_PRESETS_MIN,
  sleepAfterMinutes,
  sleepRemainingMs,
  type SleepTimer,
} from '@/player/sleep';
import { currentTrack, usePlayerStore } from '@/stores/player';
import { AppText } from '@/ui/AppText';
import { Artwork } from '@/ui/Artwork';
import { formatDuration } from '@/ui/format';
import { IconButton } from '@/ui/IconButton';
import { MenuSheet, type MenuItem } from '@/ui/MenuSheet';
import { Spacing, useColors } from '@/ui/theme';
import { useFavorite } from '@/ui/useFavorite';

/** "Pauses in 12:34" / "Pauses after this track", refreshed every second. */
function SleepStatus({ timer }: { timer: SleepTimer }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (timer.mode !== 'deadline') return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer]);
  if (timer.mode === 'off') return null;
  const text =
    timer.mode === 'endOfTrack'
      ? t('player.sleepAtEnd')
      : t('player.sleepRemaining', {
          time: formatDuration((sleepRemainingMs(timer, now) ?? 0) / 1000),
        });
  return (
    <AppText variant="secondary" testID="sleep-status" style={styles.center}>
      {text}
    </AppText>
  );
}

export default function NowPlayingScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const track = usePlayerStore(currentTrack);
  const playing = usePlayerStore((s) => s.playing);
  const position = usePlayerStore((s) => s.positionSec);
  const duration = usePlayerStore((s) => s.durationSec);
  const shuffled = usePlayerStore((s) => s.queue.original !== null);
  const repeat = usePlayerStore((s) => s.queue.repeat);
  const sleep = usePlayerStore((s) => s.sleep);
  const [favorite, toggleFavorite] = useFavorite(
    'track',
    track ? trackFavoriteKey(track.id) : null,
  );
  const [scrub, setScrub] = useState<number | null>(null);
  const [sleepMenu, setSleepMenu] = useState(false);
  const player = usePlayerStore.getState;

  const artworkSize = Math.min(width - Spacing.xl * 2, 360);
  const shown = scrub ?? position;
  const repeatLabel =
    repeat === 'off'
      ? t('player.repeatOff')
      : repeat === 'all'
        ? t('player.repeatAll')
        : t('player.repeatOne');

  const sleepItems: MenuItem[] = [
    {
      label: t('player.sleepOff'),
      icon: 'close',
      selected: sleep.mode === 'off',
      testID: 'sleep-off',
      onPress: () => void player().setSleep(SLEEP_OFF),
    },
    ...SLEEP_PRESETS_MIN.map((minutes): MenuItem => ({
      label: t('player.sleepMinutes', { count: minutes }),
      icon: 'bedtime',
      testID: `sleep-${minutes}`,
      onPress: () => void player().setSleep(sleepAfterMinutes(minutes, Date.now())),
    })),
    {
      label: t('player.sleepEndOfTrack'),
      icon: 'music_note',
      selected: sleep.mode === 'endOfTrack',
      testID: 'sleep-end-of-track',
      onPress: () => void player().setSleep({ mode: 'endOfTrack' }),
    },
  ];

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + Spacing.sm,
          paddingBottom: insets.bottom + Spacing.md,
        },
      ]}
      testID="now-playing">
      <View style={styles.topBar}>
        <IconButton
          testID="np-close"
          icon="keyboard_arrow_down"
          label={t('common.close')}
          onPress={() => router.back()}
        />
        <AppText variant="secondary">{t('player.nowPlaying')}</AppText>
        <IconButton
          testID="np-queue"
          icon="queue_music"
          label={t('player.queue')}
          onPress={() => router.push('/queue')}
        />
      </View>

      <View style={styles.artwork}>
        <Artwork
          source={track ? trackArtworkSource(track) : null}
          size={artworkSize}
          fallback="album"
        />
      </View>

      <View style={styles.titles}>
        <AppText variant="heading" numberOfLines={2} style={styles.center} testID="np-title">
          {track?.title ?? ''}
        </AppText>
        <AppText variant="secondary" numberOfLines={1} style={styles.center} testID="np-artist">
          {track?.artist ?? t('common.unknownArtist')}
        </AppText>
        {track?.album ? (
          <AppText variant="secondary" numberOfLines={1} style={styles.center}>
            {track.album}
          </AppText>
        ) : null}
      </View>

      <View>
        <Slider
          testID="seek-bar"
          accessibilityLabel={t('player.seek')}
          minimumValue={0}
          maximumValue={Math.max(duration, 1)}
          value={Math.min(shown, Math.max(duration, 1))}
          onValueChange={setScrub}
          onSlidingComplete={(value) => {
            setScrub(null);
            void player().seek(value);
          }}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.accent}
        />
        <View style={styles.times}>
          <AppText variant="secondary" testID="np-position">
            {formatDuration(shown)}
          </AppText>
          <AppText variant="secondary" testID="np-duration">
            {formatDuration(duration)}
          </AppText>
        </View>
      </View>

      <View style={styles.controls}>
        <IconButton
          testID="np-shuffle"
          icon="shuffle"
          label={shuffled ? t('player.shuffleOn') : t('player.shuffleOff')}
          selected={shuffled}
          color={shuffled ? colors.accent : colors.textSecondary}
          onPress={() => void player().toggleShuffle()}
        />
        <IconButton
          testID="np-previous"
          icon="skip_previous"
          size={36}
          label={t('player.previous')}
          onPress={() => void player().previous()}
        />
        <IconButton
          testID="np-play-pause"
          icon={playing ? 'pause' : 'play_arrow'}
          size={56}
          color={colors.accent}
          label={playing ? t('player.pause') : t('player.play')}
          onPress={() => player().togglePlay()}
        />
        <IconButton
          testID="np-next"
          icon="skip_next"
          size={36}
          label={t('player.next')}
          onPress={() => void player().next()}
        />
        <IconButton
          testID="np-repeat"
          icon={repeat === 'one' ? 'repeat_one' : 'repeat'}
          label={repeatLabel}
          selected={repeat !== 'off'}
          color={repeat === 'off' ? colors.textSecondary : colors.accent}
          onPress={() => void player().cycleRepeat()}
        />
      </View>

      <View style={styles.secondary}>
        <IconButton
          testID="np-favorite"
          icon="favorite"
          label={favorite ? t('track.unfavorite') : t('track.favorite')}
          selected={favorite}
          color={favorite ? colors.accent : colors.textSecondary}
          onPress={toggleFavorite}
          disabled={!track}
        />
        <IconButton
          testID="np-sleep"
          icon="bedtime"
          label={t('player.sleepTimer')}
          selected={sleep.mode !== 'off'}
          color={sleep.mode === 'off' ? colors.textSecondary : colors.accent}
          onPress={() => setSleepMenu(true)}
        />
      </View>
      <SleepStatus timer={sleep} />

      <MenuSheet
        visible={sleepMenu}
        title={t('player.sleepTimer')}
        items={sleepItems}
        onClose={() => setSleepMenu(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: Spacing.lg, gap: Spacing.md },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  artwork: { alignItems: 'center', paddingVertical: Spacing.sm },
  titles: { gap: Spacing.xs },
  center: { textAlign: 'center' },
  times: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.sm },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  secondary: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.xl },
});
