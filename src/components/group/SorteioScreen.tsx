"use client";

import { Button } from "@/components/ui/Button";
import type { Player, Team } from "@/lib/types";

export function SorteioScreen({
  teamA,
  teamB,
  players,
  onVoltar,
}: {
  teamA: Team | undefined;
  teamB: Team | undefined;
  players: Player[];
  onVoltar: () => void;
}) {
  const rosterOf = (team: Team | undefined) =>
    team ? players.filter((p) => p.team_id === team.id) : [];

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="border-b border-ink-200 px-5 pb-4 pt-5">
        <h1 className="font-display text-[30px] font-black leading-[1.08] tracking-[-0.02em]">
          Fechou a leva<span className="text-yellow-500">.</span>
        </h1>
      </div>
      <div className="flex-1 overflow-auto p-5">
        <div className="grid grid-cols-2 gap-5">
          {[teamA, teamB].map((team, idx) => (
            <div key={team?.id ?? idx}>
              <div className="border-b-2 border-ink-900 pb-2 font-display text-xl font-black">
                Time {team?.label ?? "?"}
              </div>
              {rosterOf(team).map((p) => (
                <div
                  key={p.id}
                  className="border-b border-ink-200 py-2.5 font-display text-lg font-bold"
                >
                  {p.name}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-ink-200 p-5">
        <Button fullWidth onClick={onVoltar}>
          Beleza, voltar pra fila
        </Button>
      </div>
    </div>
  );
}
