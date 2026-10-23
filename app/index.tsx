import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, StyleSheet, View } from 'react-native';

import { useDb } from '@/db/DbProvider';
import { useLibraryStore } from '@/stores/library';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { Spacing } from '@/ui/theme';

export default function LibraryScreen() {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const permission = useLibraryStore((s) => s.permission);
  const status = useLibraryStore((s) => s.status);
  const error = useLibraryStore((s) => s.error);
  const totalTracks = useLibraryStore((s) => s.totalTracks);
  const lastScan = useLibraryStore((s) => s.lastScan);
  const loaded = useLibraryStore((s) => s.loaded);

  useEffect(() => {
    void useLibraryStore.getState().start(db);
    // Returning from system settings may have changed the permission.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void useLibraryStore.getState().load(db);
    });
    return () => sub.remove();
  }, [db]);

  const scanning = status === 'scanning';
  const onScan = () => void useLibraryStore.getState().scan(db);
  const onGrant = () => void useLibraryStore.getState().requestPermission();
  const onOpenSettings = () => void Linking.openSettings();

  const lastScanText = lastScan
    ? t('library.lastScan', {
        date: new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(lastScan.at)),
      })
    : t('library.neverScanned');

  return (
    <Screen title={t('library.title')}>
      <Card>
        <View style={styles.countRow}>
          <AppText variant="display" testID="track-count">
            {loaded ? String(totalTracks) : '–'}
          </AppText>
          <AppText variant="heading">{t('library.tracks', { count: totalTracks })}</AppText>
        </View>
        <AppText variant="secondary" testID="last-scan">
          {lastScanText}
        </AppText>
        {lastScan && (
          <>
            <AppText variant="secondary" testID="last-result">
              {t('library.lastResult', {
                added: lastScan.result.added,
                updated: lastScan.result.updated,
                removed: lastScan.result.removed,
              })}
            </AppText>
            <AppText variant="secondary">
              {t('library.scanDuration', {
                seconds: (lastScan.result.durationMs / 1000).toFixed(1),
              })}
            </AppText>
          </>
        )}
      </Card>

      {permission === 'denied' && (
        <Card testID="permission-denied">
          <AppText>{t('library.permissionDenied')}</AppText>
          <Button label={t('library.grantAccess')} variant="secondary" onPress={onGrant} />
        </Card>
      )}

      {permission === 'blocked' && (
        <Card testID="permission-blocked">
          <AppText>{t('library.permissionBlocked')}</AppText>
          <Button label={t('library.openSettings')} variant="secondary" onPress={onOpenSettings} />
        </Card>
      )}

      {permission === 'unknown' && loaded && (
        <Card>
          <AppText>{t('library.permissionNeeded')}</AppText>
        </Card>
      )}

      {status === 'error' && error && (
        <AppText variant="error" testID="scan-error">
          {t('library.scanFailed', { message: error })}
        </AppText>
      )}

      {permission === 'granted' && lastScan && totalTracks === 0 && !scanning && (
        <AppText variant="secondary" testID="library-empty">
          {t('library.empty')}
        </AppText>
      )}

      {permission !== 'blocked' && (
        <Button
          testID="scan-button"
          label={scanning ? t('library.scanning') : t('library.scan')}
          onPress={onScan}
          busy={scanning}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
  },
});
