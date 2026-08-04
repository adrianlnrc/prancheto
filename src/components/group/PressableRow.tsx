"use client";

import type { ReactNode } from "react";
import { useLongPress } from "@/hooks/useLongPress";

/** A row that opens the player action sheet on long-press. Wraps the
 * gesture wiring shared by the arrival list and the all-teams view. */
export function PressableRow({
  onLongPress,
  className,
  children,
}: {
  onLongPress: () => void;
  className: string;
  children: ReactNode;
}) {
  const longPress = useLongPress(onLongPress);
  return (
    <div {...longPress} className={`select-none ${className}`}>
      {children}
    </div>
  );
}
