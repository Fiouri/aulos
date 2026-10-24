import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable } from 'react-native';

import type { Db } from '@/db/types';
import { useDbQuery } from '@/db/useDbQuery';
import { albumArtworkSource } from '@/library/artwork';
import { albumTracks, getAlbum } from '@/library/queries';
import { isAbortError } from '@/net/errors';
import { enabledProvider } from '@/providers/appProviders';
import type { RemoteAlbumDetail } from '@/providers/types';
import { usePlayerStore } from '@/stores/player';
import { AppText } from '@/ui/AppText';
import { Artwork } from '@/ui/Artwork';
import { Button } from '@/ui/Button';
import { DetailHeader } from '@/ui/DetailHeader';
import { providerErrorMessage } from '@/ui/errors';
import { formatDurationMs } from '@/ui/format';
import { IconButton } from '@/ui/IconButton';
import { DetailScreen } from '@/ui/Layouts';
import { albumArtistLabel } from '@/ui/library/rows';
import { openArtist } from '@/ui/navigation';
import { useColors } from '@/ui/theme';
import { TrackList } from '@/ui/TrackList';
import { useFavorite } from '@/ui/useFavorite';
import { useTrackActions } from '@/ui/useTrackActions';

/** A library album (`key`), or a provider's album that is not in the library (`provider`, `ref`). */
export default function AlbumScreen() {
  const params = useLocalSearchParams<{ key?: string; provider?: string; ref?: string }>();
  if (params.provider && params.ref) {
    return <RemoteAlbumScreen provider={params.provider} albumRef={params.ref} />;
  }
  return <LibraryAlbumScreen albumKey={params.key ?? ''} />;
}

type Loaded = { ref: string; detail: RemoteAlbumDetail } | { ref: string; error: unknown };

function RemoteAlbumScreen({ provider, albumRef }: { provider: string; albumRef: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const actions = useTrackActions();
  const source = enabledProvider(provider);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!source?.album) return;
    const controller = new AbortController();
    source.album(albumRef, controller.signal).then(
      (detail) => setLoaded({ ref: albumRef, detail }),
      (error: unknown) => {
        if (!isAbortError(error)) setLoaded({ ref: albumRef, error });
      },
    );
    return () => controller.abort();
  }, [source, albumRef]);

  const current = loaded?.ref === albumRef ? loaded : null;
  const detail = current && 'detail' in current ? current.detail : null;
  const error = !source?.album
    ? new Error('Provider not available')
    : current && 'error' in current
      ? current.error
      : null;
  const tracks = detail?.tracks ?? [];
  const album = detail?.album ?? null;
  const licenseUrl = album?.licenseUrl ?? null;
  const meta = album
    ? [
        album.year === null ? null : String(album.year),
        t('common.tracks', { count: tracks.length }),
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <DetailScreen>
      <Stack.Screen options={{ title: album?.name ?? '' }} />
      <TrackList
        tracks={tracks}
        numbered
        testIDPrefix="album-track"
        emptyText={
          error !== null
            ? providerErrorMessage(t, error)
            : detail
              ? t('library.nothingHere')
              : t('album.loading')
        }
        header={
          album ? (
            <DetailHeader
              artwork={<Artwork source={null} size={128} fallback="album" />}
              title={album.name}
              lines={[
                album.artist ?? t('common.unknownArtist'),
                meta,
                licenseUrl ? (
                  <Pressable
                    testID="album-licence"
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(licenseUrl)}>
                    <AppText style={{ color: colors.accent }} numberOfLines={1}>
                      {`${t('album.licence')}: ${licenseUrl}`}
                    </AppText>
                  </Pressable>
                ) : null,
              ]}
              actions={
                <>
                  <Button
                    testID="album-play"
                    label={t('common.play')}
                    onPress={() => void actions.play(tracks, 0)}
                  />
                  <Button
                    testID="album-shuffle"
                    variant="secondary"
                    label={t('common.shuffle')}
                    onPress={() => void actions.shuffle(tracks)}
                  />
                  {source?.capabilities.includes('download') && (
                    <IconButton
                      testID="album-download"
                      icon="download"
                      label={t('album.download')}
                      onPress={() => void actions.download(tracks)}
                    />
                  )}
                </>
              }
            />
          ) : null
        }
      />
    </DetailScreen>
  );
}

function LibraryAlbumScreen({ albumKey: key }: { albumKey: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const load = useCallback(
    async (db: Db) => ({
      album: await getAlbum(db, key),
      tracks: await albumTracks(db, key),
    }),
    [key],
  );
  const data = useDbQuery(load);
  const [favorite, toggleFavorite] = useFavorite('album', key);
  const tracks = data?.tracks ?? [];
  const album = data?.album ?? null;
  const name = album?.name ?? '';
  const artist = album?.artist ?? null;

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
              album === null ? null : artist === null ? (
                <AppText style={{ color: colors.textSecondary }}>
                  {albumArtistLabel(album, t)}
                </AppText>
              ) : (
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
