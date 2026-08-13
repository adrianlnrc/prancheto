"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Group, Round } from "@/lib/types";

export function SemRodadaScreen({
  group,
  pastRounds,
  onIniciar,
  onHistorico,
}: {
  group: Group;
  pastRounds: Round[];
  onIniciar: (teamSize: number) => void;
  onHistorico: () => void;
}) {
  const [teamSize, setTeamSize] = useState(6);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
        <div>
          <div className="font-display text-lg font-black leading-[1.1] tracking-[-0.01em]">
            {group.name}
          </div>
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
            Jogo
          </div>
        </div>
        {pastRounds.length > 0 && (
          <button
            onClick={onHistorico}
            className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500"
          >
            Hist.
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
          Jogadores por time
        </div>
        <div className="h-4" />
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTeamSize((n) => Math.max(3, n - 1))}
            className="flex h-16 w-16 items-center justify-center border-2 border-ink-900 font-display text-3xl font-black"
          >
            −
          </button>
          <div className="min-w-[72px] text-center font-display text-5xl font-black tracking-[-0.02em]">
            {teamSize}
          </div>
          <button
            onClick={() => setTeamSize((n) => Math.min(11, n + 1))}
            className="flex h-16 w-16 items-center justify-center border-2 border-ink-900 font-display text-3xl font-black"
          >
            +
          </button>
        </div>
        <div className="h-2" />
        <div className="font-body text-[13px] text-ink-500">
          Cada time fecha com {teamSize}. Dá pra mudar antes de começar.
        </div>

        {pastRounds.length > 0 && (
          <>
            <div className="h-9" />
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
              Último jogo
            </div>
            <div className="h-2" />
            <div className="font-body text-sm text-ink-600">
              {new Date(pastRounds[0].created_at).toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "short",
              })}
            </div>
          </>
        )}
      </div>

      <div className="border-t border-ink-200 p-5">
        <Button fullWidth onClick={() => onIniciar(teamSize)}>
          Iniciar
        </Button>
      </div>
    </div>
  );
}
