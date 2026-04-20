// src/hooks/useScrollToBottom.ts
//
// Track whether the founder is near the bottom of a scrollable chat.
// Two pieces of state come out:
//
//   - `visible`: whether a scroll-to-bottom FAB should be shown. True
//      once the user has scrolled up by more than one full screen height
//      from the bottom.
//   - `atBottomRef`: a ref (not state) that reflects "near the bottom".
//      Auto-scroll on new messages should read this and skip if false,
//      so a founder reading older history doesn't get yanked away.
//
// Designed for FlatList with its natural (non-inverted) orientation.

import { useCallback, useRef, useState } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

// How many pixels from the absolute bottom still count as "at bottom".
// Picked to absorb rounding noise from FlatList's layout reports.
const AT_BOTTOM_THRESHOLD = 80;

export function useScrollToBottom<T>(ref: React.RefObject<FlatList<T> | null>) {
  const atBottomRef = useRef(true);
  const [visible, setVisible] = useState(false);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      const distanceFromBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      atBottomRef.current = distanceFromBottom <= AT_BOTTOM_THRESHOLD;
      // FAB appears once the user scrolls up by more than one screen height.
      setVisible(distanceFromBottom > layoutMeasurement.height);
    },
    [],
  );

  const scrollToBottom = useCallback(
    (animated = true) => {
      ref.current?.scrollToEnd({ animated });
      atBottomRef.current = true;
      setVisible(false);
    },
    [ref],
  );

  return { onScroll, visible, scrollToBottom, atBottomRef };
}
