"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import type { Player } from "@/lib/types";

export function PinSheet({
  player,
  onClose,
  onFixar,
}: {
  player: Player | null;
  onClose: () => void;
  onFixar: (slot: "first" | "second" | null) => void;
}) {
  if (!player) return null;

  return (
    <BottomSheet open={!!player} onClose={onClose}>
      <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
        Craque — fixar antes do sorteio
      </div>
      <div className="h-2" />
      <div className="font-display text-3xl font-black tracking-[-0.02em]">
        {player.name}
      </div>
      <div className="h-4" />
      <button
        onClick={() => onFixar("first")}
        className="w-full border-t border-ink-200 py-4 text-left font-display text-lg font-bold"
      >
        Fixar no primeiro time da leva
      </button>
      <button
        onClick={() => onFixar("second")}
        className="w-full border-t border-ink-200 py-4 text-left font-display text-lg font-bold"
      >
        Fixar no segundo time da leva
      </button>
      {player.pin_slot && (
        <button
          onClick={() => onFixar(null)}
          className="w-full border-t border-ink-200 py-4 text-left font-display text-lg font-bold text-status-danger"
        >
          Tirar a fixação
        </button>
      )}
      <div className="h-3.5" />
      <Button variant="ghost" fullWidth onClick={onClose}>
        Cancelar
      </Button>
    </BottomSheet>
  );
}
