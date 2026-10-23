import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { Chips, type Chip } from '@/ui/Chips';
import { TabScreen } from '@/ui/Layouts';
import { LibraryStatus } from '@/ui/LibraryStatus';
import { AlbumsSection } from '@/ui/library/AlbumsSection';
import { ArtistsSection } from '@/ui/library/ArtistsSection';
import { FavoritesSection } from '@/ui/library/FavoritesSection';
import { PlaylistsSection } from '@/ui/library/PlaylistsSection';
import { RecentSection } from '@/ui/library/RecentSection';
import { SongsSection } from '@/ui/library/SongsSection';
import { Spacing } from '@/ui/theme';

const SECTIONS = ['songs', 'albums', 'artists', 'playlists', 'favorites', 'recent'] as const;
type Section = (typeof SECTIONS)[number];

export default function LibraryScreen() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('songs');
  const chips: Chip<Section>[] = SECTIONS.map((value) => ({
    value,
    label: t(`library.sections.${value}`),
  }));

  const header = (
    <View style={styles.header}>
      <AppText variant="title" accessibilityRole="header" style={styles.title}>
        {t('library.title')}
      </AppText>
      <LibraryStatus />
      <Chips chips={chips} value={section} onChange={setSection} testIDPrefix="section" />
    </View>
  );

  return (
    <TabScreen>
      {section === 'songs' && <SongsSection header={header} />}
      {section === 'albums' && <AlbumsSection header={header} />}
      {section === 'artists' && <ArtistsSection header={header} />}
      {section === 'playlists' && <PlaylistsSection header={header} />}
      {section === 'favorites' && <FavoritesSection header={header} />}
      {section === 'recent' && <RecentSection header={header} />}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: Spacing.md, gap: Spacing.sm },
  title: { paddingHorizontal: Spacing.md },
});
