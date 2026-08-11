"use client";

import type { PointerEventHandler, ReactNode } from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { useLongPress } from "@/hooks/useLongPress";

/** Bag of props a dnd-kit `useDraggable()` call hands back — passed through
 * so a row can be both long-pressable and draggable without the two
 * gestures fighting over the same pointerdown. */
type DragHandleProps = {
  setNodeRef: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
};

/** A row that opens the player action sheet on long-press. Wraps the
 * gesture wiring shared by the arrival list and the all-teams view.
 * Optionally also wired as a dnd-kit drag source via `dragHandleProps` —
 * the two gestures share the same pointerdown, told apart by dnd-kit's own
 * movement threshold (see useLongPress's matching cancel-on-move). */
export function PressableRow({
  onLongPress,
  className,
  children,
  dragHandleProps,
}: {
  onLongPress: () => void;
  className: string;
  children: ReactNode;
  dragHandleProps?: DragHandleProps;
}) {
  const longPress = useLongPress(onLongPress);

  const onPointerDown: PointerEventHandler = (e) => {
    longPress.onPointerDown(e);
    dragHandleProps?.listeners?.onPointerDown?.(e);
  };

  return (
    <div
      ref={dragHandleProps?.setNodeRef}
      {...dragHandleProps?.attributes}
      onPointerDown={onPointerDown}
      onPointerUp={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerLeave}
      onPointerCancel={longPress.onPointerCancel}
      onContextMenu={longPress.onContextMenu}
      className={`select-none ${className}`}
    >
      {children}
    </div>
  );
}
