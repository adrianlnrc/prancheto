"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PressableRow } from "./PressableRow";
import type { Group, Player, Round } from "@/lib/types";
import { canDraw, missingForNextDraw } from "@/lib/game/derive";

export function ChegadaScreen({
  group,
  round,
  players,
  onGoTimes,
  onGoFila,
  onAddPlayer,
  onOpenSheet,
  onSortear,
  sorteando,
}: {
  group: Group;
  round: Round;
  players: Player[];
  onGoTimes: () => void;
  onGoFila: () => void;
  onAddPlayer: (name: string) => void;
  onOpenSheet: (playerId: string) => void;
  onSortear: () => void;
  sorteando: boolean;
}) {
  const [novoNome, setNovoNome] = useState("");
  const faltam = missingForNextDraw(players, round.team_size);
  const podeSortear = canDraw(players, round.team_size);
  const arrival = [...players].sort((a, b) => a.arrival_order - b.arrival_order);

  function handleAdd() {
    const name = novoNome.trim();
    if (!name) return;
    onAddPlayer(name);
    setNovoNome("");
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
        <div>
          <div className="font-display text-lg font-black leading-[1.1] tracking-[-0.01em]">
            {group.name}
          </div>
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
            Rodada ativa · {round.team_size} por time
          </div>
        </div>
        <div className="flex gap-3.5">
          <button
            onClick={onGoTimes}
            className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500"
          >
            Times
          </button>
          <button
            onClick={onGoFila}
            className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500"
          >
            Fila
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-yellow-500 px-5 py-4">
        <div className="font-display text-[46px] font-black leading-none tracking-[-0.02em]">
          {faltam}
        </div>
        <div className="font-display text-[15px] font-bold uppercase tracking-[0.02em] leading-[1.25]">
          {faltam === 0
            ? "deu 2 times — pode sortear"
            : faltam === 1
              ? "falta 1 pra fechar a próxima leva"
              : "faltam pra fechar a próxima leva"}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 pb-3 pt-1">
        <div className="flex items-center gap-2 py-3">
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Nome de quem chegou"
            className="h-11 flex-1 border-2 border-ink-900 px-3 font-display text-base font-bold focus:outline-none"
          />
          <Button size="sm" onClick={handleAdd} disabled={!novoNome.trim()}>
            + Chegou
          </Button>
        </div>

        {arrival.map((p, i) => (
          <PlayerRow key={p.id} player={p} n={i + 1} onOpenSheet={onOpenSheet} />
        ))}

        <div className="h-2" />
        <p className="font-body text-xs text-ink-400">
          Toque e segure um nome pra editar, fixar craque, marcar machucado ou tirar da
          lista.
        </p>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-ink-200 p-5">
        <Button
          fullWidth
          disabled={!podeSortear || sorteando}
          onClick={onSortear}
        >
          {sorteando ? "Sorteando..." : "Sortear os 2 próximos times"}
        </Button>
      </div>
    </div>
  );
}

function PlayerRow({
  player: p,
  n,
  onOpenSheet,
}: {
  player: Player;
  n: number;
  onOpenSheet: (playerId: string) => void;
}) {
  const isWaiting = !p.team_id;
  const status = p.team_id ? "num time" : p.pin_slot ? "fixado" : "esperando";

  return (
    <PressableRow
      onLongPress={() => onOpenSheet(p.id)}
      className="flex items-center gap-3 border-b border-ink-200 py-[15px]"
    >
      <span className="min-w-[24px] font-mono-app text-[13px] font-bold text-ink-400">
        {String(n).padStart(2, "0")}
      </span>
      <span
        className={[
          "flex-1 font-display text-[21px] font-bold leading-[1.1]",
          isWaiting ? "text-ink-900" : "text-ink-400",
        ].join(" ")}
      >
        {p.name}
      </span>
      <span
        className={[
          "font-display text-[11px] font-bold uppercase tracking-[0.14em]",
          p.team_id ? "text-ink-500" : p.pin_slot ? "text-yellow-700" : "text-ink-300",
        ].join(" ")}
      >
        {status}
      </span>
    </PressableRow>
  );
}
