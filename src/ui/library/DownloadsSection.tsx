import { FlashList } from '@shopify/flash-list';
import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { gateOpen } from '@/downloads/manager';
import {
  useDownloadsStore,
  type DownloadItem,
  type DownloadProgressState,
} from '@/stores/downloads';
import { useNetworkStore } from '@/stores/network';
import { useSettingsStore } from '@/stores/settings';

import { AppText } from '../AppText';
import { downloadErrorMessage } from '../errors';
import { formatBytes } from '../format';
import { IconButton } from '../IconButton';
import { ListRow } from '../ListRow';
import { Spacing, useColors } from '../theme';
import { useTrackActions } from '../useTrackActions';
import { Toolbar, ToolbarButton } from './Toolbar';

type Group = 'active' | 'failed' | 'completed';

type Row =
  | { type: 'heading'; group: Group }
  | { type: 'item'; group: Group; item: DownloadItem; index: number };

function groupOf(item: DownloadItem): Group {
  if (item.status === 'completed') return 'completed';
  if (item.status === 'failed') return 'failed';
  return 'active';
}

function statusText(
  t: TFunction,
  item: DownloadItem,
  progress: DownloadProgressState | undefined,
): string {
  const done = progress?.bytesDone ?? item.bytesDone;
  const total = progress?.bytesTotal ?? item.bytesTotal;
  switch (item.status) {
    case 'queued':
      return t('downloads.queued');
    case 'paused':
      return t('downloads.paused', { done: formatBytes(done) });
    case 'downloading':
      return total
        ? t('downloads.progress', { done: formatBytes(done), total: formatBytes(total) })
        : t('downloads.progressUnknown', { done: formatBytes(done) });
    case 'failed':
      return downloadErrorMessage(t, item.error);
    case 'completed':
      return [item.track.artist ?? t('common.unknownArtist'), formatBytes(item.bytesDone)].join(
        ' · ',
      );
  }
}

/**
 * Downloads: storage used against the limit, transfers in progress (with why they wait),
 * failed ones with retry, and completed ones that play offline.
 */
export function DownloadsSection({ header }: { header: ReactElement | null }) {
  const { t } = useTranslation();
  const colors = useColors();
  const actions = useTrackActions();
  const items = useDownloadsStore((s) => s.items);
  const progress = useDownloadsStore((s) => s.progress);
  const usedBytes = useDownloadsStore((s) => s.usedBytes);
  const settings = useSettingsStore((s) => s.downloads);
  const network = useNetworkStore((s) => s.status);

  const completed = items.filter((i) => i.status === 'completed');
  const rows: Row[] = [];
  for (const group of ['active', 'failed', 'completed'] as const) {
    const members = items.filter((i) => groupOf(i) === group);
    if (members.length === 0) continue;
    rows.push({ type: 'heading', group });
    members.forEach((item, index) => rows.push({ type: 'item', group, item, index }));
  }
  const waiting =
    items.some((i) => i.status === 'queued' || i.status === 'paused') &&
    !gateOpen(network, settings);

  const deleteAll = () =>
    Alert.alert(t('downloads.deleteAllTitle'), t('downloads.deleteAllMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => void useDownloadsStore.getState().removeAll(),
      },
    ]);

  return (
    <FlashList
      data={rows}
      getItemType={(row) => row.type}
      keyExtractor={(row) => (row.type === 'heading' ? `h:${row.group}` : `d:${row.item.trackId}`)}
      ListHeaderComponent={
        <>
          {header}
          <View style={styles.summary}>
            <AppText variant="secondary" testID="downloads-storage">
              {t('downloads.storage', {
                used: formatBytes(usedBytes),
                limit: formatBytes(settings.limitBytes),
              })}
            </AppText>
            {waiting && (
              <AppText variant="secondary" testID="downloads-waiting">
                {network.online ? t('downloads.waitingForWifi') : t('downloads.waitingOffline')}
              </AppText>
            )}
          </View>
          {items.length > 0 && (
            <Toolbar>
              <ToolbarButton
                testID="downloads-delete-all"
                icon="delete"
                label={t('downloads.deleteAll')}
                onPress={deleteAll}
              />
            </Toolbar>
          )}
        </>
      }
      ListEmptyComponent={
        <AppText variant="secondary" style={styles.empty} testID="downloads-empty">
          {t('downloads.empty')}
        </AppText>
      }
      renderItem={({ item: row }) => {
        if (row.type === 'heading') {
          return (
            <AppText variant="heading" style={styles.heading}>
              {t(`downloads.${row.group}`)}
            </AppText>
          );
        }
        const { item, index, group } = row;
        const id = item.trackId;
        const store = useDownloadsStore.getState();
        return (
          <ListRow
            testID={`download-${group}-${index}`}
            title={item.track.title}
            subtitle={statusText(t, item, progress[id])}
            onPress={
              group === 'completed'
                ? () =>
                    void actions.play(
                      completed.map((c) => c.track),
                      index,
                    )
                : undefined
            }
            trailing={
              <View style={styles.actions}>
                {group === 'failed' && (
                  <IconButton
                    testID={`download-retry-${index}`}
                    icon="refresh"
                    label={t('downloads.retry')}
                    color={colors.accent}
                    onPress={() => void store.retry(id)}
                  />
                )}
                <IconButton
                  testID={`download-${group === 'active' ? 'cancel' : 'remove'}-${index}`}
                  icon={group === 'active' ? 'close' : 'delete'}
                  label={group === 'active' ? t('downloads.cancel') : t('downloads.remove')}
                  onPress={() => void (group === 'active' ? store.cancel(id) : store.remove(id))}
                />
              </View>
            }
          />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  summary: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.xs },
  heading: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  empty: { padding: Spacing.lg, textAlign: 'center' },
  actions: { flexDirection: 'row' },
});
