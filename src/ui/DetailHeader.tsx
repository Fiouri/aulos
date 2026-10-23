import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Spacing } from './theme';

interface DetailHeaderProps {
  artwork: ReactNode;
  title: string;
  lines: readonly (ReactNode | null)[];
  actions: ReactNode;
}

/** Artwork, title and meta lines, then a row of actions, above an album/artist/playlist list. */
export function DetailHeader({ artwork, title, lines, actions }: DetailHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.top}>
        {artwork}
        <View style={styles.info}>
          <AppText variant="heading" numberOfLines={3} testID="detail-title">
            {title}
          </AppText>
          {lines.map((line, i) =>
            line === null ? null : typeof line === 'string' ? (
              <AppText key={i} variant="secondary" numberOfLines={2}>
                {line}
              </AppText>
            ) : (
              <View key={i}>{line}</View>
            ),
          )}
        </View>
      </View>
      <View style={styles.actions}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.md },
  top: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  info: { flex: 1, gap: Spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
