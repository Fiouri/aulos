import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { trackArtworkSource } from '@/library/artwork';
import { currentTrack, usePlayerStore } from '@/stores/player';

import { AppText } from './AppText';
import { Artwork } from './Artwork';
import { IconButton } from './IconButton';
import { Spacing, useColors } from './theme';

/** Compact player above the tab bar (and at the bottom of detail screens). */
export function MiniPlayer() {
  const { t } = useTranslation();
  const colors = useColors();
  const track = usePlayerStore(currentTrack);
  const playing = usePlayerStore((s) => s.playing);
  const progress = usePlayerStore((s) =>
    s.durationSec > 0 ? Math.min(1, s.positionSec / s.durationSec) : 0,
  );
  if (!track) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View
          style={[styles.progress, { backgroundColor: colors.accent, width: `${progress * 100}%` }]}
        />
      </View>
      <View style={styles.row}>
        <Pressable
          testID="mini-player"
          accessibilityRole="button"
          accessibilityLabel={t('player.openNowPlaying')}
          onPress={() => router.push('/now-playing')}
          style={styles.info}>
          <Artwork source={trackArtworkSource(track)} size={40} />
          <View style={styles.text}>
            <AppText numberOfLines={1} testID="mini-title">
              {track.title}
            </AppText>
            <AppText variant="secondary" numberOfLines={1}>
              {track.artist ?? t('common.unknownArtist')}
            </AppText>
          </View>
        </Pressable>
        <IconButton
          testID="mini-play-pause"
          icon={playing ? 'pause' : 'play_arrow'}
          label={playing ? t('player.pause') : t('player.play')}
          onPress={() => usePlayerStore.getState().togglePlay()}
        />
        <IconButton
          testID="mini-next"
          icon="skip_next"
          label={t('player.next')}
          onPress={() => void usePlayerStore.getState().next()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden' },
  progressTrack: { height: 2 },
  progress: { height: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: Spacing.xs },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.md,
  },
  text: { flex: 1 },
});
