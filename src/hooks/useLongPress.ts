"use client";

import { useRef } from "react";

const LONG_PRESS_MS = 480;

/** Returns pointer handlers that fire `onLongPress` after holding a press,
 * and swallow the browser's native long-press context menu / text-selection
 * callout on mobile so it doesn't fight the gesture. */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    timer.current = setTimeout(onLongPress, LONG_PRESS_MS);
  }

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  return {
    onPointerDown: () => start(),
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
