import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  GestureDetector,
  ScrollView as GestureScrollView,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Icon } from './Icon';
import { useColors } from './theme';

/** Distance from the list edge where a drag starts scrolling, and the speed of that scroll. */
const AUTOSCROLL_EDGE = 72;
const AUTOSCROLL_STEP = 16;
const AUTOSCROLL_INTERVAL_MS = 16;

interface DragController {
  start(index: number): void;
  update(translationY: number): void;
  end(): void;
}

interface DragHandleProps {
  index: number;
  controller: DragController;
  testID?: string;
}

/** The grip a row is dragged by; the rest of the row stays tappable and scrolls the list. */
function DragHandle({ index, controller, testID }: DragHandleProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 1,
    onActivate: () => controller.start(index),
    onUpdate: (e) => controller.update(e.translationY),
    onFinalize: () => controller.end(),
  });
  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.handle}
        testID={testID}
        accessibilityLabel={t('player.reorder')}
        accessibilityHint={t('player.reorder')}>
        <Icon name="drag_indicator" color={colors.textSecondary} />
      </View>
    </GestureDetector>
  );
}

interface ReorderableListProps<T> {
  data: readonly T[];
  rowHeight: number;
  keyOf: (item: T, index: number) => string;
  /** Renders a row; place `handle` where the grip goes. */
  renderRow: (item: T, index: number, handle: ReactElement) => ReactElement;
  onMove: (from: number, to: number) => void;
  header?: ReactElement | null;
  empty?: ReactElement | null;
  initialScrollIndex?: number;
  handleTestID?: (index: number) => string;
}

interface Drag {
  from: number;
  to: number;
  rowTop: number;
  translation: number;
  scrollAtStart: number;
}

/**
 * Fixed-height FlashList whose rows can be dragged to a new position by their handle.
 * A floating copy follows the finger, a line marks the drop slot and the list scrolls when the
 * finger nears an edge. Runs the gesture callbacks on the JS thread and moves the copy through
 * Reanimated shared values.
 */
export function ReorderableList<T>({
  data,
  rowHeight,
  keyOf,
  renderRow,
  onMove,
  header = null,
  empty = null,
  initialScrollIndex,
  handleTestID,
}: ReorderableListProps<T>) {
  const colors = useColors();
  const listRef = useRef<FlashListRef<T>>(null);
  const scrollOffset = useRef(0);
  const headerHeight = useRef(0);
  const viewportHeight = useRef(0);
  const drag = useRef<Drag | null>(null);
  const autoscroll = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const ghostTop = useSharedValue(0);
  const slotTop = useSharedValue(0);

  const ghostStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ghostTop.get() }] }));
  const slotStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slotTop.get() }] }));

  const stopAutoscroll = () => {
    if (autoscroll.current) clearInterval(autoscroll.current);
    autoscroll.current = null;
  };

  useEffect(() => stopAutoscroll, []);

  const rowTopInViewport = (index: number) =>
    headerHeight.current + index * rowHeight - scrollOffset.current;

  const place = () => {
    const d = drag.current;
    if (!d) return;
    const scrolled = scrollOffset.current - d.scrollAtStart;
    const to = Math.max(
      0,
      Math.min(data.length - 1, d.from + Math.round((d.translation + scrolled) / rowHeight)),
    );
    d.to = to;
    ghostTop.set(d.rowTop + d.translation);
    // The slot line sits above the row the item will land in front of (below it when moving down).
    slotTop.set(rowTopInViewport(to > d.from ? to + 1 : to) - 1);
  };

  const scrollBy = (delta: number) => {
    const maxOffset = Math.max(
      0,
      headerHeight.current + data.length * rowHeight - viewportHeight.current,
    );
    const next = Math.max(0, Math.min(maxOffset, scrollOffset.current + delta));
    if (next === scrollOffset.current) return;
    scrollOffset.current = next;
    listRef.current?.scrollToOffset({ offset: next, animated: false });
    place();
  };

  const controller: DragController = {
    start(index) {
      drag.current = {
        from: index,
        to: index,
        rowTop: rowTopInViewport(index),
        translation: 0,
        scrollAtStart: scrollOffset.current,
      };
      place();
      setDragging(index);
    },
    update(translation) {
      const d = drag.current;
      if (!d) return;
      d.translation = translation;
      place();
      const fingerY = d.rowTop + translation + rowHeight / 2;
      const direction =
        fingerY < AUTOSCROLL_EDGE ? -1 : fingerY > viewportHeight.current - AUTOSCROLL_EDGE ? 1 : 0;
      stopAutoscroll();
      if (direction !== 0) {
        autoscroll.current = setInterval(
          () => scrollBy(direction * AUTOSCROLL_STEP),
          AUTOSCROLL_INTERVAL_MS,
        );
      }
    },
    end() {
      stopAutoscroll();
      const d = drag.current;
      drag.current = null;
      setDragging(null);
      if (d && d.to !== d.from) onMove(d.from, d.to);
    },
  };

  const draggedItem = dragging === null ? undefined : data[dragging];

  return (
    <View
      style={styles.container}
      onLayout={(e: LayoutChangeEvent) => {
        viewportHeight.current = e.nativeEvent.layout.height;
      }}>
      <FlashList
        ref={listRef}
        data={data}
        extraData={dragging}
        keyExtractor={keyOf}
        initialScrollIndex={initialScrollIndex}
        renderScrollComponent={GestureScrollView}
        scrollEnabled={dragging === null}
        onScroll={(e) => {
          scrollOffset.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        ListHeaderComponent={
          header ? (
            <View
              onLayout={(e) => {
                headerHeight.current = e.nativeEvent.layout.height;
              }}>
              {header}
            </View>
          ) : null
        }
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => (
          <View style={[{ height: rowHeight }, dragging === index && styles.lifted]}>
            {renderRow(
              item,
              index,
              <DragHandle index={index} controller={controller} testID={handleTestID?.(index)} />,
            )}
          </View>
        )}
      />
      {draggedItem !== undefined && dragging !== null && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[styles.slot, { backgroundColor: colors.accent }, slotStyle]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ghost,
              { height: rowHeight, backgroundColor: colors.surface },
              ghostStyle,
            ]}>
            {renderRow(draggedItem, dragging, <View style={styles.handle} />)}
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  handle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  lifted: { opacity: 0.3 },
  ghost: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    elevation: 8,
    borderRadius: 8,
  },
  slot: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
});
