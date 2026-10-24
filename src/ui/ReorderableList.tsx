import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactElement,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { Icon } from './Icon';
import { useColors } from './theme';

/** Distance from the list edge where a drag starts scrolling, and the speed of that scroll. */
const AUTOSCROLL_EDGE = 72;
const AUTOSCROLL_STEP = 16;
const AUTOSCROLL_INTERVAL_MS = 16;
const NOT_DRAGGING = -1;

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
      <View style={styles.handle} testID={testID} accessibilityLabel={t('player.reorder')}>
        <Icon name="drag_indicator" color={colors.textSecondary} />
      </View>
    </GestureDetector>
  );
}

/** A list row that fades while it is the one being dragged, without re-rendering the list. */
function RowContainer({
  index,
  height,
  draggingIndex,
  children,
}: {
  index: number;
  height: number;
  draggingIndex: SharedValue<number>;
  children: ReactElement;
}) {
  const style = useAnimatedStyle(() => ({ opacity: draggingIndex.get() === index ? 0.3 : 1 }));
  return <Animated.View style={[{ height }, style]}>{children}</Animated.View>;
}

interface OverlayHandle {
  show(index: number | null): void;
}

interface DragOverlayProps<T> {
  data: readonly T[];
  rowHeight: number;
  renderRow: (item: T, index: number, handle: ReactElement) => ReactElement;
  ghostTop: SharedValue<number>;
  slotTop: SharedValue<number>;
  ref: Ref<OverlayHandle>;
}

/**
 * The floating copy of the dragged row and the drop-slot line. It owns the "which row" state,
 * so starting a drag re-renders only this overlay: re-rendering the list under an active pan
 * makes RNGH cancel the gesture.
 */
function DragOverlay<T>({
  data,
  rowHeight,
  renderRow,
  ghostTop,
  slotTop,
  ref,
}: DragOverlayProps<T>) {
  const colors = useColors();
  const [index, setIndex] = useState<number | null>(null);
  useImperativeHandle(ref, () => ({ show: setIndex }), []);
  const ghostStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ghostTop.get() }] }));
  const slotStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slotTop.get() }] }));
  const item = index === null ? undefined : data[index];
  if (index === null || item === undefined) return null;
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.slot, { backgroundColor: colors.accent }, slotStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.ghost, { height: rowHeight, backgroundColor: colors.surface }, ghostStyle]}>
        {renderRow(item, index, <View style={styles.handle} />)}
      </Animated.View>
    </>
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
 * finger nears an edge. The pan callbacks run on the JS thread; the copy, the slot line and the
 * faded source row move through Reanimated shared values, so the list never re-renders mid-drag.
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
  const listRef = useRef<FlashListRef<T>>(null);
  const overlay = useRef<OverlayHandle>(null);
  const scrollOffset = useRef(0);
  const headerHeight = useRef(0);
  const viewportHeight = useRef(0);
  const drag = useRef<Drag | null>(null);
  const autoscroll = useRef<ReturnType<typeof setInterval> | null>(null);
  const ghostTop = useSharedValue(0);
  const slotTop = useSharedValue(0);
  const draggingIndex = useSharedValue(NOT_DRAGGING);

  // The controller is one object for the component's lifetime, so the handles' gesture configs
  // never change during a drag. It reads the current props through `latest`.
  const latest = useRef({ count: data.length, rowHeight, onMove });
  useEffect(() => {
    latest.current = { count: data.length, rowHeight, onMove };
  });

  const [controller] = useState<DragController>(() => {
    const stopAutoscroll = () => {
      if (autoscroll.current) clearInterval(autoscroll.current);
      autoscroll.current = null;
    };
    const rowTopInViewport = (index: number) =>
      headerHeight.current + index * latest.current.rowHeight - scrollOffset.current;
    const place = () => {
      const d = drag.current;
      if (!d) return;
      const { count, rowHeight: height } = latest.current;
      const scrolled = scrollOffset.current - d.scrollAtStart;
      const to = Math.max(
        0,
        Math.min(count - 1, d.from + Math.round((d.translation + scrolled) / height)),
      );
      d.to = to;
      ghostTop.set(d.rowTop + d.translation);
      // The slot line sits above the row the item lands in front of (below it when moving down).
      slotTop.set(rowTopInViewport(to > d.from ? to + 1 : to) - 1);
    };
    const scrollBy = (delta: number) => {
      const { count, rowHeight: height } = latest.current;
      const maxOffset = Math.max(0, headerHeight.current + count * height - viewportHeight.current);
      const next = Math.max(0, Math.min(maxOffset, scrollOffset.current + delta));
      if (next === scrollOffset.current) return;
      scrollOffset.current = next;
      listRef.current?.scrollToOffset({ offset: next, animated: false });
      place();
    };
    return {
      start(index) {
        drag.current = {
          from: index,
          to: index,
          rowTop: rowTopInViewport(index),
          translation: 0,
          scrollAtStart: scrollOffset.current,
        };
        place();
        draggingIndex.set(index);
        overlay.current?.show(index);
      },
      update(translation) {
        const d = drag.current;
        if (!d) return;
        d.translation = translation;
        place();
        const fingerY = d.rowTop + translation + latest.current.rowHeight / 2;
        const direction =
          fingerY < AUTOSCROLL_EDGE
            ? -1
            : fingerY > viewportHeight.current - AUTOSCROLL_EDGE
              ? 1
              : 0;
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
        draggingIndex.set(NOT_DRAGGING);
        overlay.current?.show(null);
        if (d && d.to !== d.from) latest.current.onMove(d.from, d.to);
      },
    };
  });

  useEffect(
    () => () => {
      if (autoscroll.current) clearInterval(autoscroll.current);
    },
    [],
  );

  return (
    <View
      style={styles.container}
      onLayout={(e: LayoutChangeEvent) => {
        viewportHeight.current = e.nativeEvent.layout.height;
      }}>
      <FlashList
        ref={listRef}
        data={data}
        keyExtractor={keyOf}
        initialScrollIndex={initialScrollIndex}
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
          <RowContainer index={index} height={rowHeight} draggingIndex={draggingIndex}>
            {renderRow(
              item,
              index,
              <DragHandle index={index} controller={controller} testID={handleTestID?.(index)} />,
            )}
          </RowContainer>
        )}
      />
      <DragOverlay
        ref={overlay}
        data={data}
        rowHeight={rowHeight}
        renderRow={renderRow}
        ghostTop={ghostTop}
        slotTop={slotTop}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  handle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
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
