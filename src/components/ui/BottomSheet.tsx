"use client";

import type { ReactNode } from "react";

export function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-20">
      <div
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "var(--overlay-scrim)" }}
      />
      <div
        className="pran-rise absolute inset-x-0 bottom-0 bg-paper p-6 pb-7"
        style={{ boxShadow: "0 -24px 60px rgba(0,0,0,.18)" }}
      >
        {children}
      </div>
    </div>
  );
}
