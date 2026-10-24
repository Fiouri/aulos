import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LOCAL_PROVIDER } from '@/library/providers';
import type { TrackItem } from '@/providers/types';

import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { Spacing, useColors } from './theme';
import { useTrackActions } from './useTrackActions';

interface SelectionBarProps {
  tracks: readonly TrackItem[];
  onDone: () => void;
}

/** Actions for the tracks picked in a list's multi-select mode. */
export function SelectionBar({ tracks, onDone }: SelectionBarProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const actions = useTrackActions();
  const run = (action: () => unknown) => () => {
    void action();
    onDone();
  };

  return (
    <View style={[styles.bar, { backgroundColor: colors.selected }]} testID="selection-bar">
      <IconButton
        icon="close"
        label={t('common.close')}
        onPress={onDone}
        testID="selection-close"
      />
      <AppText style={styles.count} testID="selection-count">
        {t('track.selected', { count: tracks.length })}
      </AppText>
      <IconButton
        icon="playlist_play"
        label={t('track.playNext')}
        onPress={run(() => actions.playNext(tracks))}
        testID="selection-play-next"
      />
      <IconButton
        icon="queue_music"
        label={t('track.addToQueue')}
        onPress={run(() => actions.addToQueue(tracks))}
        testID="selection-add-to-queue"
      />
      <IconButton
        icon="playlist_add"
        label={t('track.addToPlaylist')}
        onPress={run(() => actions.addToPlaylist(tracks))}
        testID="selection-add-to-playlist"
      />
      {tracks.some((track) => track.provider !== LOCAL_PROVIDER) && (
        <IconButton
          icon="download"
          label={t('track.download')}
          onPress={run(() => actions.download(tracks))}
          testID="selection-download"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    minHeight: 56,
  },
  count: { flex: 1 },
});
