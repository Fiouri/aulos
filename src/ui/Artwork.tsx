import { useEffect, useState } from 'react';
import { Image, PixelRatio, StyleSheet, View } from 'react-native';

import type { ArtworkSource } from '@/library/artwork';
import { artworkCache } from '@/library/artworkCache';

import { Icon, type IconName } from './Icon';
import { useColors } from './theme';

/** Cached artwork URI for `source` at `sizeDp`; null while loading or when there is none. */
export function useArtwork(source: ArtworkSource | null, sizeDp: number): string | null {
  const px = PixelRatio.getPixelSizeForLayoutSize(sizeDp);
  const [loaded, setLoaded] = useState<{ id: string; uri: string | null } | null>(null);
  const key = source?.key ?? null;
  const contentUri = source?.contentUri ?? null;
  const id = key === null ? null : `${key}|${px}`;
  const known =
    key !== null && contentUri !== null ? artworkCache.peek({ key, contentUri }, px) : null;

  useEffect(() => {
    if (key === null || contentUri === null || id === null || known !== undefined) return;
    let active = true;
    void artworkCache.get({ key, contentUri }, px).then((uri) => {
      if (active) setLoaded({ id, uri });
    });
    return () => {
      active = false;
    };
  }, [key, contentUri, id, px, known]);

  if (known !== undefined) return known;
  return loaded?.id === id ? loaded.uri : null;
}

interface ArtworkProps {
  source: ArtworkSource | null;
  size: number;
  /** Placeholder glyph when there is no artwork. */
  fallback?: IconName;
  rounded?: boolean;
}

export function Artwork({ source, size, fallback = 'music_note', rounded = false }: ArtworkProps) {
  const colors = useColors();
  const uri = useArtwork(source, size);
  const shape = {
    width: size,
    height: size,
    borderRadius: rounded ? size / 2 : size > 100 ? 12 : 6,
  };
  if (uri) {
    return (
      <Image source={{ uri }} style={[shape, styles.image]} accessibilityIgnoresInvertColors />
    );
  }
  return (
    <View style={[shape, styles.placeholder, { backgroundColor: colors.surface }]}>
      <Icon name={fallback} size={Math.round(size * 0.5)} color={colors.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { resizeMode: 'cover' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
