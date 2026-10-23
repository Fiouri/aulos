import { FlashList } from '@shopify/flash-list';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { queryAudio } from '../modules/media-store';
import { useDb } from '@/db/DbProvider';
import { isFolderExcluded, listFolders, type LibraryFolder } from '@/library/folders';
import { useLibraryStore } from '@/stores/library';
import { AppText } from '@/ui/AppText';
import { ListRow } from '@/ui/ListRow';
import { Spacing, useColors } from '@/ui/theme';

/** Settings → Library folders: switch a folder off to leave its music out of the library. */
export default function FoldersScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const db = useDb();
  const permission = useLibraryStore((s) => s.permission);
  const excluded = useLibraryStore((s) => s.excludedFolders);
  const [folders, setFolders] = useState<LibraryFolder[] | null>(null);
  const changed = useRef(false);

  useEffect(() => {
    if (permission !== 'granted') return;
    let active = true;
    void queryAudio().then((audio) => {
      if (active) setFolders(listFolders(audio));
    });
    return () => {
      active = false;
    };
  }, [permission]);

  // Exclusions take effect with one rescan when the user leaves the screen.
  useEffect(
    () => () => {
      if (changed.current) void useLibraryStore.getState().scan(db);
    },
    [db],
  );

  const setIncluded = (path: string, included: boolean) => {
    const current = useLibraryStore.getState().excludedFolders;
    const next = included ? current.filter((e) => e !== path) : [...current, path];
    changed.current = true;
    void useLibraryStore.getState().setExcludedFolders(db, next);
  };

  const message =
    permission !== 'granted'
      ? t('settings.foldersNeedAccess')
      : folders === null
        ? t('settings.foldersLoading')
        : folders.length === 0
          ? t('settings.foldersEmpty')
          : null;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {message ? (
        <AppText variant="secondary" style={styles.message}>
          {message}
        </AppText>
      ) : (
        <FlashList
          data={folders ?? []}
          extraData={excluded}
          keyExtractor={(f) => f.path}
          ListHeaderComponent={
            <AppText variant="secondary" style={styles.message}>
              {t('settings.foldersHint')}
            </AppText>
          }
          renderItem={({ item, index }) => {
            const off = isFolderExcluded(item.path, excluded);
            // A folder switched off through a parent folder follows the parent's switch.
            const inherited = off && !excluded.includes(item.path);
            return (
              <ListRow
                title={item.path}
                subtitle={t('common.tracks', { count: item.trackCount })}
                trailing={
                  <Switch
                    testID={`folder-switch-${index}`}
                    accessibilityLabel={item.path}
                    value={!off}
                    disabled={inherited}
                    onValueChange={(on) => setIncluded(item.path, on)}
                    trackColor={{ true: colors.accent, false: colors.border }}
                  />
                }
              />
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  message: { padding: Spacing.md },
});
