"use client";

import Image, { type StaticImageData } from "next/image";

/** Pill nav button used to switch between Jogadores and Fila (Jogo) — icon
 * + label, replacing the old text-only links. */
export function NavIconButton({
  onClick,
  label,
  icon,
}: {
  onClick: () => void;
  label: string;
  icon: StaticImageData;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border-2 border-ink-900 px-3 py-1.5 font-display text-[11px] font-bold uppercase tracking-[0.1em] text-ink-900"
    >
      <Image src={icon} alt="" width={16} height={16} className="h-4 w-4" />
      {label}
    </button>
  );
}
