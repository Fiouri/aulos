import { useTranslation } from 'react-i18next';

import { trackFavoriteKey } from '@/collections/favorites';
import type { Track } from '@/library/queries';

import { MenuSheet, type MenuItem } from './MenuSheet';
import { useFavorite } from './useFavorite';
import { useTrackActions } from './useTrackActions';

interface TrackMenuProps {
  track: Track | null;
  onClose: () => void;
  /** Screen-specific actions (remove from playlist, …) listed after the common ones. */
  extraItems?: readonly MenuItem[];
}

/** The ⋮ menu of a track row. */
export function TrackMenu({ track, onClose, extraItems = [] }: TrackMenuProps) {
  const { t } = useTranslation();
  const actions = useTrackActions();
  const [favorite, toggleFavorite] = useFavorite(
    'track',
    track ? trackFavoriteKey(track.id) : null,
  );

  const items: MenuItem[] = track
    ? [
        {
          label: t('track.playNext'),
          icon: 'playlist_play',
          testID: 'menu-play-next',
          onPress: () => void actions.playNext([track]),
        },
        {
          label: t('track.addToQueue'),
          icon: 'queue_music',
          testID: 'menu-add-to-queue',
          onPress: () => void actions.addToQueue([track]),
        },
        {
          label: t('track.addToPlaylist'),
          icon: 'playlist_add',
          testID: 'menu-add-to-playlist',
          onPress: () => actions.addToPlaylist([track]),
        },
        {
          label: favorite ? t('track.unfavorite') : t('track.favorite'),
          icon: 'favorite',
          selected: favorite,
          testID: 'menu-favorite',
          onPress: toggleFavorite,
        },
        ...(track.albumKey !== null
          ? [
              {
                label: t('track.goToAlbum'),
                icon: 'album' as const,
                testID: 'menu-go-to-album',
                onPress: () => actions.goToAlbum(track),
              },
            ]
          : []),
        ...(track.artist !== null
          ? [
              {
                label: t('track.goToArtist'),
                icon: 'person' as const,
                testID: 'menu-go-to-artist',
                onPress: () => actions.goToArtist(track),
              },
            ]
          : []),
        ...extraItems,
      ]
    : [];

  return (
    <MenuSheet visible={track !== null} title={track?.title} items={items} onClose={onClose} />
  );
}
