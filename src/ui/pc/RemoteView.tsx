import Slider from '@react-native-community/slider';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, StyleSheet, View } from 'react-native';

import { isRequestAllowed } from '@/net/guard';
import { primaryCredit } from '@/nuclear/match';
import type { JamQueueItem, JamTrack } from '@/nuclear/schemas';
import { usePcStore } from '@/stores/pc';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { formatDuration } from '../format';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { ListRow } from '../ListRow';
import { TextPrompt } from '../TextPrompt';
import { Spacing, useColors } from '../theme';
import { showToast } from '../toast';

const ARTWORK_PX = 96;

/** Artwork URL of a PC track the phone may load (HTTPS, or HTTP to the user's own network). */
function artworkUrl(track: JamTrack | undefined): string | null {
  const items = track?.artwork?.items ?? [];
  const preferred =
    items.find((a) => a.purpose === 'cover' || a.purpose === 'thumbnail') ?? items[0];
  return preferred && isRequestAllowed(preferred.url) ? preferred.url : null;
}

function artists(track: JamTrack): string {
  return track.artists.map((a) => a.name).join(', ');
}

/** Connected (or reconnecting) to a PC: what Nuclear plays, its controls and its queue. */
export function RemoteView() {
  const { t } = useTranslation();
  const colors = useColors();
  const pc = usePcStore();
  const [seeking, setSeeking] = useState<number | null>(null);
  const [savingQueue, setSavingQueue] = useState(false);

  const queue = pc.queue;
  const current = queue?.items[queue.currentIndex]?.track;
  const duration = pc.playback?.duration ?? 0;
  const position = seeking ?? Math.min(pc.playback?.seek ?? 0, Math.max(duration, 0));
  const playing = pc.playback?.status === 'playing';
  const repeat = pc.settings?.repeat ?? 'off';
  const art = artworkUrl(current);

  const confirmClear = () =>
    Alert.alert(t('pc.clearTitle'), t('pc.clearMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('pc.clearQueue'), style: 'destructive', onPress: () => void pc.clearQueue() },
    ]);

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.fill}>
          <AppText variant="title" numberOfLines={1}>
            {pc.pairing?.name ?? t('pc.title')}
          </AppText>
          <AppText
            testID="pc-status"
            style={{ color: pc.connection === 'connected' ? colors.accent : colors.textSecondary }}>
            {t(`pc.status.${pc.connection}`)}
          </AppText>
        </View>
        <IconButton
          testID="pc-disconnect"
          icon="link_off"
          label={t('pc.disconnect')}
          onPress={() => pc.disconnect()}
        />
      </View>

      <View style={styles.nowPlaying}>
        {art ? (
          <Image source={{ uri: art }} style={styles.artwork} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.artwork, styles.placeholder, { backgroundColor: colors.surface }]}>
            <Icon name="computer" size={40} color={colors.textSecondary} />
          </View>
        )}
        <View style={styles.fill}>
          <AppText variant="heading" numberOfLines={2} testID="pc-title">
            {current?.title ?? t('pc.nothingPlaying')}
          </AppText>
          {current && (
            <AppText variant="secondary" numberOfLines={1} testID="pc-artist">
              {primaryCredit(current.artists) ?? t('common.unknownArtist')}
            </AppText>
          )}
        </View>
      </View>

      <Slider
        testID="pc-seek"
        accessibilityLabel={t('pc.seek')}
        minimumValue={0}
        maximumValue={Math.max(duration, 1)}
        value={position}
        disabled={duration <= 0}
        onValueChange={setSeeking}
        onSlidingComplete={(value) => {
          setSeeking(null);
          void pc.seek(value);
        }}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.accent}
      />
      <View style={styles.times}>
        <AppText variant="secondary" testID="pc-position">
          {formatDuration(position)}
        </AppText>
        <AppText variant="secondary" testID="pc-duration">
          {formatDuration(duration)}
        </AppText>
      </View>

      <View style={styles.controls}>
        <IconButton
          testID="pc-shuffle"
          icon="shuffle"
          label={pc.settings?.shuffle ? t('player.shuffleOn') : t('player.shuffleOff')}
          selected={pc.settings?.shuffle ?? false}
          color={pc.settings?.shuffle ? colors.accent : colors.textSecondary}
          onPress={() => void pc.toggleShuffle()}
        />
        <IconButton
          testID="pc-previous"
          icon="skip_previous"
          label={t('player.previous')}
          size={36}
          onPress={() => void pc.previous()}
        />
        <IconButton
          testID="pc-play-pause"
          icon={playing ? 'pause' : 'play_arrow'}
          label={playing ? t('player.pause') : t('player.play')}
          size={48}
          color={colors.accent}
          onPress={() => void pc.togglePlay()}
        />
        <IconButton
          testID="pc-next"
          icon="skip_next"
          label={t('player.next')}
          size={36}
          onPress={() => void pc.next()}
        />
        <IconButton
          testID="pc-repeat"
          icon={repeat === 'one' ? 'repeat_one' : 'repeat'}
          label={
            repeat === 'all'
              ? t('player.repeatAll')
              : repeat === 'one'
                ? t('player.repeatOne')
                : t('player.repeatOff')
          }
          selected={repeat !== 'off'}
          color={repeat === 'off' ? colors.textSecondary : colors.accent}
          onPress={() => void pc.cycleRepeat()}
        />
      </View>

      <View style={styles.volumeRow}>
        <Icon name="volume_up" color={colors.textSecondary} />
        <Slider
          testID="pc-volume"
          accessibilityLabel={t('pc.volume')}
          style={styles.fill}
          minimumValue={0}
          maximumValue={1}
          value={pc.volume ?? 0}
          disabled={pc.volume === null}
          onSlidingComplete={(value) => void pc.setVolume(Math.round(value * 100) / 100)}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.accent}
        />
        <AppText variant="secondary" testID="pc-volume-value" style={styles.volumeValue}>
          {pc.volume === null ? '–' : `${Math.round(pc.volume * 100)}%`}
        </AppText>
      </View>

      <View style={styles.actions}>
        <IconButton
          testID="pc-favorite"
          icon="favorite"
          label={t('pc.favorite')}
          color={colors.textSecondary}
          onPress={() =>
            void pc.favoriteCurrent().then(() => {
              if (usePcStore.getState().lastError === null) showToast(t('pc.favorited'));
            })
          }
        />
        <Button
          testID="pc-search"
          variant="secondary"
          label={t('pc.search')}
          onPress={() => router.push('/pc-search')}
        />
        <IconButton
          testID="pc-save-queue"
          icon="playlist_add"
          label={t('pc.saveQueue')}
          color={colors.textSecondary}
          onPress={() => setSavingQueue(true)}
        />
      </View>

      {pc.lastError !== null && (
        <AppText variant="error" testID="pc-error">
          {t('pc.error', { message: pc.lastError })}
        </AppText>
      )}

      <View style={styles.titleRow}>
        <AppText variant="heading" style={styles.fill}>
          {t('pc.queue')}
        </AppText>
        <IconButton
          testID="pc-queue-clear"
          icon="clear_all"
          label={t('pc.clearQueue')}
          onPress={confirmClear}
        />
      </View>
    </View>
  );

  return (
    <>
      <FlashList
        data={queue?.items ?? []}
        keyExtractor={(item: JamQueueItem) => item.id}
        extraData={queue?.currentIndex}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <AppText variant="secondary" style={styles.empty} testID="pc-queue-empty">
            {t('pc.queueEmpty')}
          </AppText>
        }
        renderItem={({ item, index }) => (
          <ListRow
            testID={`pc-queue-${index}`}
            title={item.track.title}
            subtitle={artists(item.track)}
            leading={
              <Icon
                name={index === queue?.currentIndex ? 'equalizer' : 'music_note'}
                color={index === queue?.currentIndex ? colors.accent : colors.textSecondary}
              />
            }
            onPress={() => void pc.goTo(index)}
            trailing={
              <IconButton
                testID={`pc-queue-remove-${index}`}
                icon="close"
                label={t('pc.removeItem')}
                onPress={() => void pc.remove(item.id)}
              />
            }
          />
        )}
      />
      <TextPrompt
        visible={savingQueue}
        title={t('pc.saveQueueTitle')}
        confirmLabel={t('common.save')}
        onCancel={() => setSavingQueue(false)}
        onConfirm={(name) => {
          setSavingQueue(false);
          void pc.saveQueueAsPlaylist(name).then((id) => {
            if (id !== null) showToast(t('pc.savedQueue', { name }));
          });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { padding: Spacing.md, gap: Spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fill: { flex: 1 },
  nowPlaying: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  artwork: { width: ARTWORK_PX, height: ARTWORK_PX, borderRadius: 12 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  volumeValue: { width: 48, textAlign: 'right' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { padding: Spacing.lg, textAlign: 'center' },
});
