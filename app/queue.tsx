import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { QueueEntry } from '@/player/queue';
import { usePlayerStore } from '@/stores/player';
import { AppText } from '@/ui/AppText';
import { IconButton } from '@/ui/IconButton';
import { ReorderableList } from '@/ui/ReorderableList';
import { Toolbar, ToolbarButton } from '@/ui/library/Toolbar';
import { Spacing, useColors } from '@/ui/theme';
import { TRACK_ROW_HEIGHT, TrackRow } from '@/ui/TrackRow';

/** The play queue: tap to jump, drag to reorder, × to remove. */
export default function QueueScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const entries = usePlayerStore((s) => s.queue.entries);
  const index = usePlayerStore((s) => s.queue.index);
  const tracks = usePlayerStore((s) => s.tracks);
  const player = usePlayerStore.getState;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID="queue-screen">
      <ReorderableList<QueueEntry>
        data={entries}
        rowHeight={TRACK_ROW_HEIGHT}
        keyOf={(entry) => String(entry.key)}
        initialScrollIndex={Math.max(0, index - 2)}
        onMove={(from, to) => void player().move(from, to)}
        handleTestID={(i) => `queue-handle-${i}`}
        header={
          entries.length > 0 ? (
            <Toolbar>
              <ToolbarButton
                testID="queue-clear"
                icon="delete"
                label={t('player.clearQueue')}
                onPress={() => void player().clear()}
              />
            </Toolbar>
          ) : null
        }
        empty={
          <AppText variant="secondary" style={styles.empty} testID="queue-empty">
            {t('player.queueEmpty')}
          </AppText>
        }
        renderRow={(entry, i, handle) => {
          const track = tracks[entry.trackId];
          if (!track) return <View />;
          return (
            <View style={styles.row}>
              <View style={styles.fill}>
                <TrackRow
                  track={track}
                  leading={handle}
                  current={i === index}
                  testID={`queue-item-${i}`}
                  onPress={() => void player().skipToIndex(i)}
                />
              </View>
              <IconButton
                testID={`queue-remove-${i}`}
                icon="close"
                label={t('player.remove')}
                onPress={() => void player().removeAt(i)}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  empty: { padding: Spacing.lg, textAlign: 'center' },
});
