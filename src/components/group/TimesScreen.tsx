"use client";

import { Button } from "@/components/ui/Button";
import type { Player, Round, Team } from "@/lib/types";
import { waitingPlayers } from "@/lib/game/derive";

export function TimesScreen({
  round,
  teams,
  players,
  onGoFila,
  onOpenSheet,
}: {
  round: Round;
  teams: Team[];
  players: Player[];
  onGoFila: () => void;
  onOpenSheet: (playerId: string) => void;
}) {
  const ordered = [...teams].sort((a, b) => a.label.localeCompare(b.label));
  const waiting = waitingPlayers(players);

  function statusOf(t: Team) {
    if (t.id === round.current_home_team_id || t.id === round.current_away_team_id) {
      return "em campo";
    }
    if (t.status === "queued") return `${(t.queue_position ?? 0)}º da fila`;
    return "montando";
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-5 py-4">
        <div>
          <div className="font-display text-lg font-black leading-[1.1] tracking-[-0.01em]">
            Todos os times
          </div>
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
            {ordered.length} times · {round.team_size} por time
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onGoFila}>
          Fila
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
        {ordered.map((t) => {
          const roster = players.filter((p) => p.team_id === t.id);
          const playing =
            t.id === round.current_home_team_id || t.id === round.current_away_team_id;
          return (
            <div key={t.id} className="border border-ink-200">
              <div
                className={[
                  "flex items-center justify-between gap-2 px-3.5 py-3",
                  playing ? "bg-yellow-500" : "bg-paper-2",
                ].join(" ")}
              >
                <div className="font-display text-[22px] font-black tracking-[-0.02em]">
                  Time {t.label}
                </div>
                <div
                  className={[
                    "font-display text-[10px] font-bold uppercase tracking-[0.16em]",
                    playing ? "text-ink-900" : "text-ink-500",
                  ].join(" ")}
                >
                  {statusOf(t)}
                </div>
              </div>
              <div className="grid grid-cols-2">
                {roster.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => onOpenSheet(p.id)}
                    className="flex cursor-pointer items-baseline gap-2 border-t border-ink-200 px-3.5 py-2.5"
                  >
                    <span className="font-mono-app text-[11px] font-bold text-ink-400">
                      {String(roster.indexOf(p) + 1).padStart(2, "0")}
                    </span>
                    <span className="font-display text-base font-bold">{p.name}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-ink-200 px-3.5 py-2 font-body text-xs text-ink-500">
                {roster.length} de {round.team_size}
                {roster.length < round.team_size
                  ? ` — falta ${round.team_size - roster.length}, completa com quem perder`
                  : " — completo"}
              </div>
            </div>
          );
        })}

        <div>
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-700">
            De fora ({waiting.length})
          </div>
          {waiting.map((p, i) => (
            <div
              key={p.id}
              onClick={() => onOpenSheet(p.id)}
              className="flex cursor-pointer items-baseline gap-2.5 border-b border-ink-200 py-2.5"
            >
              <span className="font-mono-app text-xs font-bold text-ink-400">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 font-display text-lg font-bold">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
