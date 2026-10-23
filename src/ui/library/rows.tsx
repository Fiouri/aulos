import { useTranslation } from 'react-i18next';

import type { Playlist } from '@/collections/playlists';
import { albumArtworkSource } from '@/library/artwork';
import type { Album, Artist } from '@/library/queries';

import { Artwork } from '../Artwork';
import { Icon } from '../Icon';
import { ListRow } from '../ListRow';
import { openAlbum, openArtist, openPlaylist } from '../navigation';
import { useColors } from '../theme';

export function AlbumRow({ album, testID }: { album: Album; testID?: string }) {
  const { t } = useTranslation();
  const subtitle = [
    album.artist ?? t('common.unknownArtist'),
    album.year === null ? null : String(album.year),
    t('common.tracks', { count: album.trackCount }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      testID={testID}
      title={album.name}
      subtitle={subtitle}
      leading={<Artwork source={albumArtworkSource(album)} size={48} fallback="album" />}
      onPress={() => openAlbum(album.name, album.artist)}
    />
  );
}

export function ArtistRow({ artist, testID }: { artist: Artist; testID?: string }) {
  const { t } = useTranslation();
  return (
    <ListRow
      testID={testID}
      title={artist.name}
      subtitle={`${t('common.albums', { count: artist.albumCount })} · ${t('common.tracks', { count: artist.trackCount })}`}
      leading={
        <Artwork
          source={
            artist.samplePath
              ? { key: `artist:${artist.name}`, contentUri: artist.samplePath }
              : null
          }
          size={48}
          fallback="person"
          rounded
        />
      }
      onPress={() => openArtist(artist.name)}
    />
  );
}

export function PlaylistRow({ playlist, testID }: { playlist: Playlist; testID?: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <ListRow
      testID={testID}
      title={playlist.name}
      subtitle={t('common.tracks', { count: playlist.trackCount })}
      leading={<Icon name="queue_music" size={32} color={colors.textSecondary} />}
      onPress={() => openPlaylist(playlist.id)}
    />
  );
}
