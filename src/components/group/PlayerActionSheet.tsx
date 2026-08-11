"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { SwapPicker } from "./SwapPicker";
import type { Player, Team } from "@/lib/types";

type Step = "root" | "pick-team" | "pick-swap";

export function PlayerActionSheet({
  player,
  teams,
  players,
  teamSize,
  onClose,
  onRename,
  onLesionado,
  onRemover,
  onMove,
}: {
  player: Player | null;
  teams: Team[];
  players: Player[];
  teamSize: number;
  onClose: () => void;
  onRename: (name: string) => void;
  onLesionado: () => void;
  onRemover: () => void;
  onMove: (targetTeamId: string, swapOutPlayerId?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player?.name ?? "");
  const [step, setStep] = useState<Step>("root");
  const [swapTargetTeam, setSwapTargetTeam] = useState<Team | null>(null);

  if (!player) return null;

  const currentTeam = teams.find((t) => t.id === player.team_id) ?? null;
  const isPlayingNow = currentTeam?.status === "playing";
  const isWaiting = !player.team_id;
  const canMove = !isPlayingNow;

  const rosterOf = (teamId: string) => players.filter((p) => p.team_id === teamId);
  const eligibleTeams = teams.filter(
    (t) => t.status !== "playing" && t.status !== "done" && t.id !== player.team_id,
  );

  function close() {
    setStep("root");
    setSwapTargetTeam(null);
    onClose();
  }

  function handlePickTeam(team: Team) {
    const roster = rosterOf(team.id);
    if (roster.length < teamSize) {
      onMove(team.id);
      close();
    } else {
      setSwapTargetTeam(team);
      setStep("pick-swap");
    }
  }

  function handlePickSwap(swapOut: Player) {
    if (!swapTargetTeam) return;
    onMove(swapTargetTeam.id, swapOut.id);
    close();
  }

  if (step === "pick-team") {
    return (
      <BottomSheet open onClose={close}>
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
          Mover {player.name} pra
        </div>
        <div className="h-3" />
        <div className="flex flex-col">
          {eligibleTeams.length === 0 && (
            <p className="py-4 font-body text-sm text-ink-500">
              Nenhum outro time disponível agora.
            </p>
          )}
          {eligibleTeams.map((t) => {
            const roster = rosterOf(t.id);
            const full = roster.length >= teamSize;
            return (
              <button
                key={t.id}
                onClick={() => handlePickTeam(t)}
                className="flex items-center justify-between border-t border-ink-200 py-4 text-left font-display text-lg font-bold last:border-b"
              >
                <span>Time {t.label}</span>
                <span className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
                  {roster.length}/{teamSize}
                  {full ? " · troca" : ""}
                </span>
              </button>
            );
          })}
        </div>
        <div className="h-3" />
        <Button variant="ghost" fullWidth onClick={() => setStep("root")}>
          Voltar
        </Button>
      </BottomSheet>
    );
  }

  if (step === "pick-swap" && swapTargetTeam) {
    return (
      <SwapPicker
        playerName={player.name}
        team={swapTargetTeam}
        roster={rosterOf(swapTargetTeam.id)}
        onPick={handlePickSwap}
        onClose={close}
        onBack={() => setStep("pick-team")}
      />
    );
  }

  return (
    <BottomSheet open onClose={close}>
      <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
        {isPlayingNow ? "Em quadra agora" : isWaiting ? "Na fila de espera" : "No time"}
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

        {canMove && (
          <Button variant="outline" fullWidth onClick={() => setStep("pick-team")}>
            Mover pra outro time
          </Button>
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
      <Button variant="ghost" fullWidth onClick={close}>
        Cancelar
      </Button>
    </BottomSheet>
  );
}
