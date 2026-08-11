"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { NavIconButton } from "./NavIconButton";
import playerIcon from "./assets/player.png";
import type { Player, Round, Team } from "@/lib/types";
import { queuedTeams } from "@/lib/game/derive";

export function FilaScreen({
  round,
  teams,
  players,
  onGoTimes,
  onVenceu,
}: {
  round: Round;
  teams: Team[];
  players: Player[];
  onGoTimes: () => void;
  onVenceu: (winner: "home" | "away") => void;
}) {
  const home = teams.find((t) => t.id === round.current_home_team_id);
  const away = teams.find((t) => t.id === round.current_away_team_id);
  const rosterOf = (team: Team | undefined) =>
    team ? players.filter((p) => p.team_id === team.id) : [];
  const queue = queuedTeams(teams);
  const [confirming, setConfirming] = useState<"home" | "away" | null>(null);

  if (!home || !away) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <p className="font-display text-lg font-bold">
          Esperando fechar mais um time pra jogo começar.
        </p>
        <div className="h-4" />
        <Button variant="ghost" onClick={onGoTimes}>
          Voltar pra lista
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
        <div>
          <div className="font-display text-lg font-black leading-[1.1] tracking-[-0.01em]">
            {"Fila de jogo"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NavIconButton onClick={onGoTimes} label="Jogadores" icon={playerIcon} />
        </div>
      </div>

      <div className="flex-1 overflow-auto pb-3">
        <div className="bg-yellow-500 px-5 pb-5 pt-4">
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em]">
            Em campo agora
          </div>
          <div className="h-3.5" />
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
            <div>
              <div className="font-display text-[26px] font-black tracking-[-0.02em]">
                Time {home.label}
              </div>
              <div className="h-2" />
              {rosterOf(home).map((p) => (
                <div key={p.id} className="font-display text-[15px] font-bold leading-[1.5]">
                  {p.name}
                </div>
              ))}
            </div>
            <div className="pt-2 font-display text-sm font-black">x</div>
            <div className="text-right">
              <div className="font-display text-[26px] font-black tracking-[-0.02em]">
                Time {away.label}
              </div>
              <div className="h-2" />
              {rosterOf(away).map((p) => (
                <div key={p.id} className="font-display text-[15px] font-bold leading-[1.5]">
                  {p.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 pt-4">
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
            Esperando a vez
          </div>
          {queue.map((t, i) => {
            const roster = rosterOf(t);
            const complete = roster.length >= round.team_size;
            return (
              <div
                key={t.id}
                className="flex items-baseline gap-3 border-b border-ink-200 py-3.5"
              >
                <span className="font-mono-app text-[13px] font-bold text-ink-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <div className="font-display text-[21px] font-black">Time {t.label}</div>
                  <div className="font-body text-[13px] text-ink-500">
                    {roster.map((p) => p.name).join(", ")}
                  </div>
                </div>
                <span
                  className={[
                    "font-display text-[11px] font-bold uppercase tracking-[0.14em]",
                    complete ? "text-ink-400" : "text-yellow-700",
                  ].join(" ")}
                >
                  {complete ? "completo" : `falta ${round.team_size - roster.length}`}
                </span>
              </div>
            );
          })}
          <div className="h-3.5" />
          <div className="font-display text-sm font-bold text-ink-700">
            Quem perder sai. {queue[0] ? `Entra o Time ${queue[0].label}.` : "Ninguém na fila ainda."}
          </div>
        </div>
      </div>

      <div className="border-t border-ink-200 p-5">
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
          Quem venceu?
        </div>
        <div className="h-3" />
        <div className="flex flex-col gap-2.5">
          <Button fullWidth onClick={() => setConfirming("home")}>
            Time {home.label} venceu
          </Button>
          <Button fullWidth onClick={() => setConfirming("away")}>
            Time {away.label} venceu
          </Button>
        </div>
      </div>

      <BottomSheet open={!!confirming} onClose={() => setConfirming(null)}>
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
          Confirma?
        </div>
        <div className="h-2" />
        <div className="font-display text-2xl font-black tracking-[-0.02em]">
          Time {confirming === "home" ? home.label : away.label} venceu
        </div>
        <div className="h-6" />
        <div className="flex flex-col gap-3">
          <Button
            fullWidth
            onClick={() => {
              if (confirming) onVenceu(confirming);
              setConfirming(null);
            }}
          >
            Confirmar
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setConfirming(null)}>
            Cancelar
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
