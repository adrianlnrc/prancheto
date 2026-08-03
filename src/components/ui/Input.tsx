"use client";

import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
};

export function Input({ label, hint, className = "", ...props }: Props) {
  return (
    <label className="flex flex-col gap-2">
      {label && (
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
          {label}
        </span>
      )}
      <input
        {...props}
        className={[
          "h-[52px] border-2 border-ink-900 bg-paper px-4",
          "font-display text-lg font-bold text-ink-900 placeholder:text-ink-300",
          "focus:outline-none focus:border-yellow-500",
          className,
        ].join(" ")}
      />
      {hint && <span className="font-body text-[13px] text-ink-500">{hint}</span>}
    </label>
  );
}
