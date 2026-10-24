import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Db } from '@/db/types';
import { useDbQuery } from '@/db/useDbQuery';
import { artistAlbums, artistTracks, getArtist } from '@/library/queries';
import { usePlayerStore } from '@/stores/player';
import { AppText } from '@/ui/AppText';
import { Artwork } from '@/ui/Artwork';
import { Button } from '@/ui/Button';
import { DetailHeader } from '@/ui/DetailHeader';
import { IconButton } from '@/ui/IconButton';
import { DetailScreen } from '@/ui/Layouts';
import { AlbumRow } from '@/ui/library/rows';
import { Spacing, useColors } from '@/ui/theme';
import { TrackList } from '@/ui/TrackList';
import { useFavorite } from '@/ui/useFavorite';

export default function ArtistScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const { name } = useLocalSearchParams<{ name: string }>();
  const load = useCallback(
    async (db: Db) => ({
      artist: await getArtist(db, name),
      albums: await artistAlbums(db, name),
      tracks: await artistTracks(db, name),
    }),
    [name],
  );
  const data = useDbQuery(load);
  const [favorite, toggleFavorite] = useFavorite('artist', name);
  const tracks = data?.tracks ?? [];
  const artist = data?.artist ?? null;
  const albums = data?.albums ?? [];
  const counts = artist
    ? `${t('common.albums', { count: artist.albumCount })} · ${t('common.tracks', { count: artist.trackCount })}`
    : null;

  return (
    <DetailScreen>
      <Stack.Screen options={{ title: name }} />
      <TrackList
        tracks={tracks}
        testIDPrefix="artist-track"
        header={
          <View>
            <DetailHeader
              artwork={
                <Artwork
                  source={
                    artist?.samplePath
                      ? { key: `artist:${artist.name}`, contentUri: artist.samplePath }
                      : null
                  }
                  size={96}
                  fallback="person"
                  rounded
                />
              }
              title={name}
              lines={[counts]}
              actions={
                <>
                  <Button
                    testID="artist-play"
                    label={t('common.play')}
                    onPress={() => void usePlayerStore.getState().playTracks(tracks, 0)}
                  />
                  <Button
                    testID="artist-shuffle"
                    variant="secondary"
                    label={t('common.shuffle')}
                    onPress={() => void usePlayerStore.getState().shuffleTracks(tracks)}
                  />
                  <IconButton
                    testID="artist-favorite"
                    icon="favorite"
                    label={favorite ? t('artist.unfavorite') : t('artist.favorite')}
                    selected={favorite}
                    color={favorite ? colors.accent : colors.textSecondary}
                    onPress={toggleFavorite}
                  />
                </>
              }
            />
            {albums.length > 0 && (
              <AppText variant="heading" style={styles.heading}>
                {t('artist.albums')}
              </AppText>
            )}
            {albums.map((album, index) => (
              <AlbumRow key={album.key} album={album} testID={`artist-album-${index}`} />
            ))}
            <AppText variant="heading" style={styles.heading}>
              {t('artist.songs')}
            </AppText>
          </View>
        }
      />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
});
