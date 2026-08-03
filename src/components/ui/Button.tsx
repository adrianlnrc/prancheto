"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "dark" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-yellow-500 text-ink-900 active:bg-yellow-600",
  dark: "bg-ink-900 text-paper active:bg-ink-800",
  outline: "bg-paper text-ink-900 border-2 border-ink-900",
  ghost: "bg-transparent text-ink-900",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-4 text-xs",
  md: "h-[42px] px-5 text-xs",
  lg: "h-[50px] px-6 text-sm",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
};

export function Button({
  variant = "primary",
  size = "lg",
  fullWidth = false,
  className = "",
  disabled,
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={[
        "font-display font-extrabold uppercase tracking-[0.08em] transition-transform duration-150",
        "flex items-center justify-center rounded-full select-none",
        fullWidth ? "w-full" : "",
        variantClasses[variant],
        sizeClasses[size],
        disabled ? "opacity-40 pointer-events-none" : "active:translate-y-px",
        className,
      ].join(" ")}
    />
  );
}
