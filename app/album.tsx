import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import type { Db } from '@/db/types';
import { useDbQuery } from '@/db/useDbQuery';
import { albumArtworkSource } from '@/library/artwork';
import { albumKey, albumTracks, getAlbum } from '@/library/queries';
import { usePlayerStore } from '@/stores/player';
import { AppText } from '@/ui/AppText';
import { Artwork } from '@/ui/Artwork';
import { Button } from '@/ui/Button';
import { DetailHeader } from '@/ui/DetailHeader';
import { formatDurationMs } from '@/ui/format';
import { IconButton } from '@/ui/IconButton';
import { DetailScreen } from '@/ui/Layouts';
import { openArtist } from '@/ui/navigation';
import { useColors } from '@/ui/theme';
import { TrackList } from '@/ui/TrackList';
import { useFavorite } from '@/ui/useFavorite';

export default function AlbumScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const params = useLocalSearchParams<{ name: string; artist?: string }>();
  const name = params.name;
  const artist = params.artist ?? null;
  const load = useCallback(
    async (db: Db) => ({
      album: await getAlbum(db, name, artist),
      tracks: await albumTracks(db, name, artist),
    }),
    [name, artist],
  );
  const data = useDbQuery(load);
  const [favorite, toggleFavorite] = useFavorite('album', albumKey(name, artist));
  const tracks = data?.tracks ?? [];
  const album = data?.album ?? null;

  const meta = album
    ? [
        album.year === null ? null : String(album.year),
        t('common.tracks', { count: album.trackCount }),
        formatDurationMs(album.durationMs),
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <DetailScreen>
      <Stack.Screen options={{ title: name }} />
      <TrackList
        tracks={tracks}
        numbered
        testIDPrefix="album-track"
        header={
          <DetailHeader
            artwork={
              <Artwork
                source={album ? albumArtworkSource(album) : null}
                size={128}
                fallback="album"
              />
            }
            title={name}
            lines={[
              artist === null ? null : (
                <Pressable accessibilityRole="link" onPress={() => openArtist(artist)}>
                  <AppText style={{ color: colors.accent }}>{artist}</AppText>
                </Pressable>
              ),
              meta,
            ]}
            actions={
              <>
                <Button
                  testID="album-play"
                  label={t('common.play')}
                  onPress={() => void usePlayerStore.getState().playTracks(tracks, 0)}
                />
                <Button
                  testID="album-shuffle"
                  variant="secondary"
                  label={t('common.shuffle')}
                  onPress={() => void usePlayerStore.getState().shuffleTracks(tracks)}
                />
                <IconButton
                  testID="album-favorite"
                  icon="favorite"
                  label={favorite ? t('album.unfavorite') : t('album.favorite')}
                  selected={favorite}
                  color={favorite ? colors.accent : colors.textSecondary}
                  onPress={toggleFavorite}
                />
              </>
            }
          />
        }
      />
    </DetailScreen>
  );
}
