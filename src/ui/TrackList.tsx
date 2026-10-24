import { FlashList } from '@shopify/flash-list';
import { useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { currentEntry } from '@/player/queue';
import { isStoredTrack, type TrackItem } from '@/providers/types';
import { usePlayerStore } from '@/stores/player';

import { AppText } from './AppText';
import type { MenuItem } from './MenuSheet';
import { SelectionBar } from './SelectionBar';
import { TrackMenu } from './TrackMenu';
import { TrackRow } from './TrackRow';
import { Spacing } from './theme';
import { useTrackActions } from './useTrackActions';

interface TrackListProps<T extends TrackItem> {
  /** Stored tracks, or remote ones that are stored when the user acts on them. */
  tracks: readonly T[];
  header?: ReactElement | null;
  emptyText?: string;
  /** Show the tag track number instead of artwork. */
  numbered?: boolean;
  /** Plays the list from the tapped row unless overridden. */
  onPlay?: (index: number) => void;
  extraMenuItems?: (track: T, index: number) => MenuItem[];
  testIDPrefix?: string;
}

/**
 * Virtualised track list (FlashList) with a ⋮ menu per row and multi-select on long press:
 * selected tracks can be played next, queued or added to a playlist in one go.
 */
export function TrackList<T extends TrackItem>({
  tracks,
  header = null,
  emptyText,
  numbered = false,
  onPlay,
  extraMenuItems,
  testIDPrefix = 'track',
}: TrackListProps<T>) {
  const actions = useTrackActions();
  const currentTrackId = usePlayerStore((s) => currentEntry(s.queue)?.trackId ?? null);
  const [selected, setSelected] = useState<ReadonlySet<number> | null>(null);
  const [menu, setMenu] = useState<{ track: T; index: number } | null>(null);
  const selecting = selected !== null;

  const toggle = (index: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next.size === 0 ? null : next;
    });

  const play = (index: number) => {
    if (onPlay) onPlay(index);
    else void actions.play(tracks, index);
  };

  const selectedTracks = selected
    ? [...selected].sort((a, b) => a - b).flatMap((i) => (tracks[i] ? [tracks[i]] : []))
    : [];

  return (
    <View style={styles.container}>
      {selecting && <SelectionBar tracks={selectedTracks} onDone={() => setSelected(null)} />}
      <FlashList
        data={tracks}
        extraData={{ selected, currentTrackId }}
        keyExtractor={(track, index) => `${index}:${track.provider}:${track.providerRef}`}
        ListHeaderComponent={header}
        ListEmptyComponent={
          emptyText ? (
            <AppText variant="secondary" style={styles.empty}>
              {emptyText}
            </AppText>
          ) : null
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            testID={`${testIDPrefix}-${index}`}
            number={numbered ? item.trackNo : undefined}
            current={isStoredTrack(item) && item.id === currentTrackId}
            selecting={selecting}
            selected={selected?.has(index) ?? false}
            onPress={() => (selecting ? toggle(index) : play(index))}
            onLongPress={() => toggle(index)}
            onMore={() => setMenu({ track: item, index })}
          />
        )}
      />
      <TrackMenu
        track={menu?.track ?? null}
        onClose={() => setMenu(null)}
        extraItems={menu && extraMenuItems ? extraMenuItems(menu.track, menu.index) : []}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { padding: Spacing.lg, textAlign: 'center' },
});
