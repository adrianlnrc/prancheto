"use client";

import { useRef } from "react";

const LONG_PRESS_MS = 480;
// Beyond this, a hold reads as a drag starting (or a scroll), not a tap —
// matches the distance dnd-kit's PointerSensor uses to tell drags from taps
// on the same rows, so the two gestures don't fight over the same pointerdown.
const MOVE_CANCEL_PX = 8;

/** Returns pointer handlers that fire `onLongPress` after holding a press,
 * and swallow the browser's native long-press context menu / text-selection
 * callout on mobile so it doesn't fight the gesture. Cancels if the pointer
 * moves too far before the timer fires — that's a drag or a scroll, not a
 * tap. Tracked on `window`, not the row itself: a fast drag can carry the
 * pointer past the row's bounds before a local pointermove is delivered,
 * same reason dnd-kit tracks movement at the document level instead of on
 * the origin element. */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start_ = useRef<{ x: number; y: number } | null>(null);
  const onWindowMove = useRef<((e: PointerEvent) => void) | null>(null);

  function stopTrackingMove() {
    if (onWindowMove.current) {
      window.removeEventListener("pointermove", onWindowMove.current);
      onWindowMove.current = null;
    }
  }

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start_.current = null;
    stopTrackingMove();
  }

  function start(e: React.PointerEvent) {
    start_.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(onLongPress, LONG_PRESS_MS);

    const onMove = (moveEvent: PointerEvent) => {
      if (!start_.current) return;
      const dx = moveEvent.clientX - start_.current.x;
      const dy = moveEvent.clientY - start_.current.y;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) cancel();
    };
    onWindowMove.current = onMove;
    window.addEventListener("pointermove", onMove);
  }

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
