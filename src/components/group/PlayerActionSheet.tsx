"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import type { Player } from "@/lib/types";

export function PlayerActionSheet({
  player,
  onClose,
  onRename,
  onLesionado,
  onRemover,
  onFixar,
}: {
  player: Player | null;
  onClose: () => void;
  onRename: (name: string) => void;
  onLesionado: () => void;
  onRemover: () => void;
  onFixar: (slot: "first" | "second" | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player?.name ?? "");

  if (!player) return null;

  const isWaiting = !player.team_id;

  return (
    <BottomSheet open={!!player} onClose={onClose}>
      <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
        {isWaiting ? "Na fila de espera" : "No time"}
      </div>
      <div className="h-2" />
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border-b-2 border-ink-900 font-display text-3xl font-black tracking-[-0.02em] focus:outline-none"
        />
      ) : (
        <div className="font-display text-3xl font-black tracking-[-0.02em]">
          {player.name}
        </div>
      )}
      <div className="h-5" />
      <div className="flex flex-col gap-3">
        {editing ? (
          <Button
            fullWidth
            onClick={() => {
              if (name.trim()) onRename(name.trim());
              setEditing(false);
            }}
          >
            Salvar nome
          </Button>
        ) : (
          <Button fullWidth onClick={() => setEditing(true)}>
            Editar nome
          </Button>
        )}

        {isWaiting && (
          <div className="flex flex-col">
            <button
              onClick={() => onFixar("first")}
              className="w-full border-t border-ink-200 py-4 text-left font-display text-lg font-bold"
            >
              Fixar no primeiro time da leva
            </button>
            <button
              onClick={() => onFixar("second")}
              className="w-full border-t border-b border-ink-200 py-4 text-left font-display text-lg font-bold"
            >
              Fixar no segundo time da leva
            </button>
            {player.pin_slot && (
              <button
                onClick={() => onFixar(null)}
                className="w-full py-4 text-left font-display text-lg font-bold text-status-danger"
              >
                Tirar a fixação
              </button>
            )}
          </div>
        )}

        {!isWaiting && (
          <div>
            <Button variant="outline" fullWidth onClick={onLesionado}>
              Saiu machucado
            </Button>
            <div className="pt-1.5 text-center font-body text-xs text-ink-500">
              Sai da lista e entra o primeiro de fora.
            </div>
          </div>
        )}

        <button
          onClick={onRemover}
          className="flex min-h-[52px] items-center justify-center border-2 border-status-danger font-display text-[13px] font-bold uppercase tracking-[0.12em] text-status-danger"
        >
          Tirar da lista
        </button>
      </div>
      <div className="h-3" />
      <Button variant="ghost" fullWidth onClick={onClose}>
        Cancelar
      </Button>
    </BottomSheet>
  );
}
