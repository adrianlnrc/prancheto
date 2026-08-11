"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import type { Player, Team } from "@/lib/types";

/** "Quem sai?" step shared by the tap-to-move flow and the drag-to-a-full-team
 * flow — both need to pick who leaves a full team before move_player runs. */
export function SwapPicker({
  playerName,
  team,
  roster,
  onPick,
  onClose,
  onBack,
}: {
  playerName: string;
  team: Team;
  roster: Player[];
  onPick: (swapOut: Player) => void;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <BottomSheet open onClose={onClose}>
      <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
        Time {team.label} tá completo
      </div>
      <div className="h-2" />
      <div className="font-display text-xl font-black tracking-[-0.02em]">
        Quem sai no lugar de {playerName}?
      </div>
      <div className="h-3" />
      <div className="flex flex-col">
        {roster.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className="border-t border-ink-200 py-4 text-left font-display text-lg font-bold last:border-b"
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="h-3" />
      <Button variant="ghost" fullWidth onClick={onBack ?? onClose}>
        {onBack ? "Voltar" : "Cancelar"}
      </Button>
    </BottomSheet>
  );
}
