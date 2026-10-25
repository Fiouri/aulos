import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LOCAL_PROVIDER } from '@/library/providers';
import { enabledProvider } from '@/providers/appProviders';
import { isStoredTrack, type TrackItem } from '@/providers/types';

import { MenuSheet, type MenuItem } from './MenuSheet';
import { TrackInfoSheet } from './TrackInfoSheet';
import { useSendToPc } from './useSendToPc';
import { useTrackActions } from './useTrackActions';
import { useTrackFavorite } from './useTrackFavorite';

interface TrackMenuProps<T extends TrackItem> {
  track: T | null;
  onClose: () => void;
  /** Screen-specific actions (remove from playlist, …) listed after the common ones. */
  extraItems?: readonly MenuItem[];
}

/** The ⋮ menu of a track row, for stored and remote tracks alike. */
export function TrackMenu<T extends TrackItem>({
  track,
  onClose,
  extraItems = [],
}: TrackMenuProps<T>) {
  const { t } = useTranslation();
  const actions = useTrackActions();
  const [favorite, toggleFavorite] = useTrackFavorite(track);
  const [info, setInfo] = useState<TrackItem | null>(null);
  const sendToPc = useSendToPc();

  const inLibrary = track !== null && isStoredTrack(track) && track.localPath !== null;
  const downloadable =
    track !== null &&
    track.provider !== LOCAL_PROVIDER &&
    !inLibrary &&
    enabledProvider(track.provider)?.capabilities.includes('download') === true;
  const hasAlbum =
    track !== null &&
    (inLibrary ? isStoredTrack(track) && track.albumKey !== null : track.albumRef !== null);

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
          onPress: () => void actions.addToPlaylist([track]),
        },
        {
          label: favorite ? t('track.unfavorite') : t('track.favorite'),
          icon: 'favorite',
          selected: favorite,
          testID: 'menu-favorite',
          onPress: toggleFavorite,
        },
        ...(downloadable
          ? [
              {
                label: t('track.download'),
                icon: 'download' as const,
                testID: 'menu-download',
                onPress: () => void actions.download([track]),
              },
            ]
          : []),
        ...(hasAlbum
          ? [
              {
                label: t('track.goToAlbum'),
                icon: 'album' as const,
                testID: 'menu-go-to-album',
                onPress: () => actions.goToAlbum(track),
              },
            ]
          : []),
        ...(inLibrary && track.artist !== null
          ? [
              {
                label: t('track.goToArtist'),
                icon: 'person' as const,
                testID: 'menu-go-to-artist',
                onPress: () => actions.goToArtist(track),
              },
            ]
          : []),
        {
          label: t('track.sendToPc'),
          icon: 'computer',
          testID: 'menu-send-to-pc',
          onPress: () => void sendToPc(track),
        },
        {
          label: t('track.info'),
          icon: 'info',
          testID: 'menu-info',
          onPress: () => setInfo(track),
        },
        ...extraItems,
      ]
    : [];

  return (
    <>
      <MenuSheet visible={track !== null} title={track?.title} items={items} onClose={onClose} />
      <TrackInfoSheet track={info} onClose={() => setInfo(null)} />
    </>
  );
}
