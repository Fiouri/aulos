import { getIpAddressAsync } from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useDb } from '@/db/DbProvider';
import { isAbortError } from '@/net/errors';
import { isPrivateHost } from '@/net/guard';
import { createJamClient, jamBaseUrl } from '@/nuclear/client';
import {
  discoverPcs,
  healthProbe,
  parseHostEntry,
  scannableSubnet,
  type FoundPc,
} from '@/nuclear/discovery';
import {
  forgetPairing,
  listPairings,
  markSecurityNoticeSeen,
  renamePairing,
  savePairing,
  securityNoticeSeen,
  type Pairing,
} from '@/nuclear/pairings';
import { useNetworkStore } from '@/stores/network';
import { usePcStore } from '@/stores/pc';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Card } from '../Card';
import { IconButton } from '../IconButton';
import { ListRow } from '../ListRow';
import { MenuSheet } from '../MenuSheet';
import { TextPrompt } from '../TextPrompt';
import { Spacing, useColors } from '../theme';

type Discovery =
  | { phase: 'idle' }
  | { phase: 'running'; done: number; total: number; found: FoundPc[] }
  | { phase: 'done'; found: FoundPc[] }
  | { phase: 'unavailable'; reason: 'wifi' | 'vpn' };

/** Not paired yet (or disconnected): find a PC, type its address or pick a saved one. */
export function PairingView() {
  const { t } = useTranslation();
  const db = useDb();
  const colors = useColors();
  const unmetered = useNetworkStore((s) => s.status.unmetered);
  const [noticeSeen, setNoticeSeen] = useState(true);
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [discovery, setDiscovery] = useState<Discovery>({ phase: 'idle' });
  const [entry, setEntry] = useState('');
  const [entryState, setEntryState] = useState<{ checking: boolean; error: string | null }>({
    checking: false,
    error: null,
  });
  const [menu, setMenu] = useState<Pairing | null>(null);
  const [renaming, setRenaming] = useState<Pairing | null>(null);
  const scan = useRef<AbortController | null>(null);

  const reload = useCallback(async () => setPairings(await listPairings(db)), [db]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [seen, saved] = await Promise.all([securityNoticeSeen(db), listPairings(db)]);
      if (!active) return;
      setNoticeSeen(seen);
      setPairings(saved);
    })();
    return () => {
      active = false;
      scan.current?.abort();
    };
  }, [db]);

  const connect = async (name: string, pc: FoundPc) => {
    const pairing = await savePairing(db, name, jamBaseUrl(pc.host, pc.port));
    usePcStore.getState().connect(pairing);
  };

  const discover = async () => {
    if (!unmetered) {
      setDiscovery({ phase: 'unavailable', reason: 'wifi' });
      return;
    }
    const ipv4 = await getIpAddressAsync();
    if (!scannableSubnet(ipv4)) {
      setDiscovery({ phase: 'unavailable', reason: 'vpn' });
      return;
    }
    const controller = new AbortController();
    scan.current = controller;
    const found: FoundPc[] = [];
    setDiscovery({ phase: 'running', done: 0, total: 0, found });
    try {
      const result = await discoverPcs({
        ipv4,
        probe: healthProbe(),
        signal: controller.signal,
        onProgress: (done, total) =>
          setDiscovery({ phase: 'running', done, total, found: [...found] }),
        onFound: (pc) => found.push(pc),
      });
      setDiscovery({ phase: 'done', found: result });
    } catch (error) {
      setDiscovery(isAbortError(error) ? { phase: 'idle' } : { phase: 'done', found });
    } finally {
      scan.current = null;
    }
  };

  const connectManual = async () => {
    const pc = parseHostEntry(entry);
    if (!pc) {
      setEntryState({ checking: false, error: t('pc.invalidHost') });
      return;
    }
    if (!isPrivateHost(pc.host)) {
      setEntryState({ checking: false, error: t('pc.notPrivate') });
      return;
    }
    setEntryState({ checking: true, error: null });
    try {
      await createJamClient({ baseUrl: jamBaseUrl(pc.host, pc.port) }).health();
      setEntryState({ checking: false, error: null });
      await connect(`${pc.host}:${pc.port}`, pc);
    } catch {
      setEntryState({
        checking: false,
        error: t('pc.noAnswer', { host: `${pc.host}:${pc.port}` }),
      });
    }
  };

  const found = discovery.phase === 'running' || discovery.phase === 'done' ? discovery.found : [];

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <AppText variant="title" accessibilityRole="header">
        {t('pc.title')}
      </AppText>
      {!noticeSeen && (
        <Card>
          <AppText testID="pc-notice">{t('pc.notice')}</AppText>
          <Button
            testID="pc-notice-ok"
            label={t('pc.noticeOk')}
            onPress={() =>
              void markSecurityNoticeSeen(db).then(() => {
                setNoticeSeen(true);
              })
            }
          />
        </Card>
      )}
      <AppText variant="secondary">{t('pc.intro')}</AppText>

      <Card>
        {discovery.phase === 'running' ? (
          <View style={styles.row}>
            <AppText style={styles.fill} testID="pc-discover-progress">
              {t('pc.discoverProgress', { done: discovery.done, total: discovery.total })}
            </AppText>
            <Button
              testID="pc-discover-cancel"
              variant="secondary"
              label={t('pc.cancel')}
              onPress={() => scan.current?.abort()}
            />
          </View>
        ) : (
          <Button testID="pc-discover" label={t('pc.discover')} onPress={() => void discover()} />
        )}
        {discovery.phase === 'unavailable' && (
          <AppText variant="secondary" testID="pc-discover-unavailable">
            {discovery.reason === 'wifi' ? t('pc.discoverNeedsWifi') : t('pc.discoverVpn')}
          </AppText>
        )}
        {discovery.phase === 'done' && (
          <AppText variant="secondary" testID="pc-discover-result">
            {discovery.found.length > 0
              ? t('pc.discoverDone', { count: discovery.found.length })
              : t('pc.discoverNone')}
          </AppText>
        )}
        {found.map((pc, index) => (
          <ListRow
            key={`${pc.host}:${pc.port}`}
            testID={`pc-found-${index}`}
            title={`${pc.host}:${pc.port}`}
            onPress={() => void connect(`${pc.host}:${pc.port}`, pc)}
          />
        ))}
      </Card>

      <Card>
        <AppText variant="heading">{t('pc.manual')}</AppText>
        <AppText variant="secondary">{t('pc.manualHint')}</AppText>
        <TextInput
          testID="pc-host-input"
          value={entry}
          onChangeText={setEntry}
          placeholder={t('pc.manualPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={() => void connectManual()}
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        />
        {entryState.error !== null && (
          <AppText variant="error" testID="pc-host-error">
            {entryState.error}
          </AppText>
        )}
        <Button
          testID="pc-host-connect"
          label={entryState.checking ? t('pc.checking') : t('pc.connect')}
          disabled={entryState.checking || entry.trim() === ''}
          onPress={() => void connectManual()}
        />
      </Card>

      {pairings.length > 0 && (
        <Card>
          <AppText variant="heading">{t('pc.saved')}</AppText>
          {pairings.map((pairing, index) => (
            <ListRow
              key={pairing.id}
              testID={`pc-pairing-${index}`}
              title={pairing.name}
              subtitle={pairing.baseUrl.replace(/^http:\/\//, '')}
              onPress={() => usePcStore.getState().connect(pairing)}
              trailing={
                <IconButton
                  testID={`pc-pairing-more-${index}`}
                  icon="more_vert"
                  label={t('common.more')}
                  onPress={() => setMenu(pairing)}
                />
              }
            />
          ))}
        </Card>
      )}

      <MenuSheet
        visible={menu !== null}
        title={menu?.name}
        onClose={() => setMenu(null)}
        items={
          menu
            ? [
                {
                  label: t('pc.rename'),
                  icon: 'edit',
                  testID: 'pc-pairing-rename',
                  onPress: () => setRenaming(menu),
                },
                {
                  label: t('pc.forget'),
                  icon: 'delete',
                  testID: 'pc-pairing-forget',
                  onPress: () => void forgetPairing(db, menu.id).then(reload),
                },
              ]
            : []
        }
      />
      <TextPrompt
        visible={renaming !== null}
        title={t('pc.renameTitle')}
        initialValue={renaming?.name}
        confirmLabel={t('common.save')}
        onCancel={() => setRenaming(null)}
        onConfirm={(name) => {
          const target = renaming;
          setRenaming(null);
          if (target) void renamePairing(db, target.id, name).then(reload);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.md, gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  fill: { flex: 1 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 48, paddingHorizontal: Spacing.md },
});
