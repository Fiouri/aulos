import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { trackArtworkSource } from '@/library/artwork';
import { isStoredTrack, type TrackItem } from '@/providers/types';

import { AppText } from './AppText';
import { Artwork } from './Artwork';
import { formatDurationMs } from './format';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Spacing, useColors } from './theme';

export const TRACK_ROW_HEIGHT = 64;

interface TrackRowProps {
  /** A stored track, or a remote one (search results, remote albums). */
  track: TrackItem;
  onPress: () => void;
  onLongPress?: () => void;
  onMore?: () => void;
  /** Track number shown instead of artwork (album screens). */
  number?: number | null;
  selecting?: boolean;
  selected?: boolean;
  /** The track the player is on. */
  current?: boolean;
  /** Drawn before everything else, e.g. a drag handle. */
  leading?: ReactNode;
  testID?: string;
}

export function TrackRow({
  track,
  onPress,
  onLongPress,
  onMore,
  number,
  selecting = false,
  selected = false,
  current = false,
  leading,
  testID,
}: TrackRowProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const subtitle = [track.artist ?? t('common.unknownArtist'), track.album]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={selecting ? { checked: selected } : { selected: current }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        (pressed || selected) && { backgroundColor: colors.selected },
        leading !== undefined && styles.withLeading,
      ]}>
      {leading}
      {selecting && (
        <Icon
          name={selected ? 'check_circle' : 'radio_button_unchecked'}
          color={selected ? colors.accent : colors.textSecondary}
        />
      )}
      {number !== undefined ? (
        <AppText variant="secondary" style={styles.number}>
          {number ?? ''}
        </AppText>
      ) : (
        <Artwork source={isStoredTrack(track) ? trackArtworkSource(track) : null} size={48} />
      )}
      <View style={styles.text}>
        <AppText numberOfLines={1} style={current ? { color: colors.accent } : undefined}>
          {track.title}
        </AppText>
        <AppText variant="secondary" numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
      <AppText variant="secondary">{formatDurationMs(track.durationMs)}</AppText>
      {onMore && !selecting && (
        <IconButton
          icon="more_vert"
          label={t('common.more')}
          onPress={onMore}
          testID={testID ? `${testID}-more` : undefined}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: TRACK_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
  },
  withLeading: { paddingLeft: 0, gap: Spacing.sm },
  number: { width: 28, textAlign: 'center' },
  text: { flex: 1, gap: 2 },
});
