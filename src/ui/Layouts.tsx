import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayer } from './MiniPlayer';
import { useColors } from './theme';

/** Tab screen: content below the status bar, mini player above the native tab bar. */
export function TabScreen({ children }: { children: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.fill}>{children}</View>
      <MiniPlayer />
    </View>
  );
}

/** Pushed screen under the native header, with the mini player at the bottom. */
export function DetailScreen({ children }: { children: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={styles.fill}>{children}</View>
      <View style={{ paddingBottom: insets.bottom }}>
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
