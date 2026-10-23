import { FlashList } from '@shopify/flash-list';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { favoriteAlbums, favoriteArtists, favoriteTracks } from '@/collections/favorites';
import type { Db } from '@/db/types';
import { useDbQuery } from '@/db/useDbQuery';
import type { Album, Artist, Track } from '@/library/queries';
import { currentEntry } from '@/player/queue';
import { usePlayerStore } from '@/stores/player';

import { AppText } from '../AppText';
import { Spacing } from '../theme';
import { TrackMenu } from '../TrackMenu';
import { TrackRow } from '../TrackRow';
import { AlbumRow, ArtistRow } from './rows';

type Item =
  | { type: 'heading'; title: string }
  | { type: 'track'; track: Track; index: number }
  | { type: 'album'; album: Album; index: number }
  | { type: 'artist'; artist: Artist; index: number };

const loadFavorites = async (db: Db) => ({
  tracks: await favoriteTracks(db),
  albums: await favoriteAlbums(db),
  artists: await favoriteArtists(db),
});

/** Favorite songs, albums and artists in one list, newest first within each group. */
export function FavoritesSection({ header }: { header: ReactElement }) {
  const { t } = useTranslation();
  const data = useDbQuery(loadFavorites);
  const currentTrackId = usePlayerStore((s) => currentEntry(s.queue)?.trackId ?? null);
  const [menu, setMenu] = useState<Track | null>(null);
  const tracks = data?.tracks ?? [];

  const items: Item[] = [];
  if (tracks.length > 0) {
    items.push({ type: 'heading', title: t('favorites.songs') });
    tracks.forEach((track, index) => items.push({ type: 'track', track, index }));
  }
  if (data && data.albums.length > 0) {
    items.push({ type: 'heading', title: t('favorites.albums') });
    data.albums.forEach((album, index) => items.push({ type: 'album', album, index }));
  }
  if (data && data.artists.length > 0) {
    items.push({ type: 'heading', title: t('favorites.artists') });
    data.artists.forEach((artist, index) => items.push({ type: 'artist', artist, index }));
  }

  return (
    <>
      <FlashList
        data={items}
        extraData={currentTrackId}
        getItemType={(item) => item.type}
        keyExtractor={(item) =>
          item.type === 'heading'
            ? `h:${item.title}`
            : item.type === 'track'
              ? `t:${item.track.id}`
              : item.type === 'album'
                ? `a:${item.album.name}\u0000${item.album.artist ?? ''}`
                : `r:${item.artist.name}`
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          data ? (
            <AppText variant="secondary" style={styles.empty} testID="favorites-empty">
              {t('favorites.empty')}
            </AppText>
          ) : null
        }
        renderItem={({ item }) => {
          switch (item.type) {
            case 'heading':
              return (
                <AppText variant="heading" style={styles.heading}>
                  {item.title}
                </AppText>
              );
            case 'track':
              return (
                <TrackRow
                  track={item.track}
                  testID={`favorite-track-${item.index}`}
                  current={item.track.id === currentTrackId}
                  onPress={() => void usePlayerStore.getState().playTracks(tracks, item.index)}
                  onMore={() => setMenu(item.track)}
                />
              );
            case 'album':
              return <AlbumRow album={item.album} testID={`favorite-album-${item.index}`} />;
            case 'artist':
              return <ArtistRow artist={item.artist} testID={`favorite-artist-${item.index}`} />;
          }
        }}
      />
      <TrackMenu track={menu} onClose={() => setMenu(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  empty: { padding: Spacing.lg, textAlign: 'center' },
});
