"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/Button";
import { PressableRow } from "./PressableRow";
import { SwapPicker } from "./SwapPicker";
import type { Group, Player, Round, Team } from "@/lib/types";
import { canDraw, missingForNextDraw, waitingPlayers } from "@/lib/game/derive";

const NEW_TEAM_DROP_ID = "__new_team__";

type View = "lista" | "times";
type Draw = { a: string; b: string };
type DrawResult = { team_a_id: string; team_b_id: string };

export function JogadoresScreen({
  group,
  round,
  players,
  teams,
  onGoFila,
  onAddPlayer,
  onOpenSheet,
  onSortear,
  onSortearNovo,
  onMovePlayer,
  onCreateTeam,
}: {
  group: Group;
  round: Round;
  players: Player[];
  teams: Team[];
  onGoFila: () => void;
  onAddPlayer: (name: string) => void;
  onOpenSheet: (playerId: string) => void;
  onSortear: () => Promise<DrawResult[] | DrawResult | null>;
  onSortearNovo: (teamAId: string, teamBId: string) => Promise<void>;
  onMovePlayer: (playerId: string, targetTeamId: string, swapOutPlayerId?: string) => void;
  onCreateTeam: (playerId: string) => void;
}) {
  const [view, setView] = useState<View>("lista");
  const [novoNome, setNovoNome] = useState("");
  const [sorteando, setSorteando] = useState(false);
  const [revealedDraw, setRevealedDraw] = useState<Draw | null>(null);

  const hasDrawn = !!round.current_home_team_id;
  const faltam = missingForNextDraw(players, round.team_size);
  const podeSortear = !hasDrawn && canDraw(players, round.team_size);

  function handleAdd() {
    const name = novoNome.trim();
    if (!name) return;
    onAddPlayer(name);
    setNovoNome("");
  }

  async function handleSortear() {
    setSorteando(true);
    try {
      const result = await onSortear();
      const row = Array.isArray(result) ? result[0] : result;
      if (row) setRevealedDraw({ a: row.team_a_id, b: row.team_b_id });
    } finally {
      setSorteando(false);
    }
  }

  async function handleSortearNovo() {
    if (!revealedDraw) return;
    setSorteando(true);
    try {
      await onSortearNovo(revealedDraw.a, revealedDraw.b);
    } finally {
      setSorteando(false);
    }
  }

  const teamA = revealedDraw ? teams.find((t) => t.id === revealedDraw.a) : undefined;
  const teamB = revealedDraw ? teams.find((t) => t.id === revealedDraw.b) : undefined;

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
        <div className="flex items-center gap-3">
          {!revealedDraw && (
            <div className="flex border-2 border-ink-900">
              <button
                onClick={() => setView("lista")}
                className={`px-2.5 py-1.5 font-display text-[10px] font-bold tracking-[0.14em] ${
                  view === "lista" ? "bg-ink-900 text-paper" : "bg-paper text-ink-900"
                }`}
              >
                LISTA
              </button>
              <button
                onClick={() => setView("times")}
                className={`px-2.5 py-1.5 font-display text-[10px] font-bold tracking-[0.14em] ${
                  view === "times" ? "bg-ink-900 text-paper" : "bg-paper text-ink-900"
                }`}
              >
                TIMES
              </button>
            </div>
          )}
          <button
            onClick={onGoFila}
            className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500"
          >
            Fila
          </button>
        </div>
      </div>

      {revealedDraw ? (
        <div className="flex-1 overflow-auto p-5">
          <div className="font-display text-[30px] font-black leading-[1.08] tracking-[-0.02em]">
            Deu os 2 times<span className="text-yellow-500">.</span>
          </div>
          <div className="h-5" />
          <div className="grid grid-cols-2 gap-5">
            {[teamA, teamB].map((t, idx) => (
              <div key={t?.id ?? idx}>
                <div className="border-b-2 border-ink-900 pb-2 font-display text-xl font-black">
                  Time {t?.label ?? "?"}
                </div>
                {players
                  .filter((p) => p.team_id === t?.id)
                  .map((p) => (
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
      ) : (
        <>
          {!hasDrawn && (
            <div className="flex items-center gap-4 bg-yellow-500 px-5 py-4">
              <div className="font-display text-[46px] font-black leading-none tracking-[-0.02em]">
                {faltam}
              </div>
              <div className="font-display text-[15px] font-bold uppercase tracking-[0.02em] leading-[1.25]">
                {faltam === 0
                  ? "deu 2 times — pode sortear"
                  : faltam === 1
                    ? "falta 1 pro sorteio inicial"
                    : "faltam pro sorteio inicial"}
              </div>
            </div>
          )}

          {view === "lista" ? (
            <ListaCompleta
              players={players}
              novoNome={novoNome}
              onNovoNomeChange={setNovoNome}
              onAdd={handleAdd}
              onOpenSheet={onOpenSheet}
            />
          ) : (
            <DivididoPorTimes
              round={round}
              teams={teams}
              players={players}
              onOpenSheet={onOpenSheet}
              onMovePlayer={onMovePlayer}
              onCreateTeam={onCreateTeam}
            />
          )}
        </>
      )}

      {(revealedDraw || !hasDrawn) && (
        <div className="flex flex-col gap-2.5 border-t border-ink-200 p-5">
          {revealedDraw ? (
            <>
              <Button fullWidth onClick={() => setRevealedDraw(null)}>
                Beleza, continuar
              </Button>
              <Button variant="ghost" fullWidth disabled={sorteando} onClick={handleSortearNovo}>
                {sorteando ? "Sorteando..." : "Sortear de novo"}
              </Button>
            </>
          ) : (
            <Button fullWidth disabled={!podeSortear || sorteando} onClick={handleSortear}>
              {sorteando ? "Sorteando..." : "Sortear os 2 times iniciais"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ListaCompleta({
  players,
  novoNome,
  onNovoNomeChange,
  onAdd,
  onOpenSheet,
}: {
  players: Player[];
  novoNome: string;
  onNovoNomeChange: (value: string) => void;
  onAdd: () => void;
  onOpenSheet: (playerId: string) => void;
}) {
  const arrival = [...players].sort((a, b) => a.arrival_order - b.arrival_order);

  return (
    <div className="flex-1 overflow-auto px-5 pb-3 pt-1">
      <div className="flex items-center gap-2 py-3">
        <input
          value={novoNome}
          onChange={(e) => onNovoNomeChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder="Nome de quem chegou"
          className="h-11 flex-1 border-2 border-ink-900 px-3 font-display text-base font-bold focus:outline-none"
        />
        <Button size="sm" onClick={onAdd} disabled={!novoNome.trim()}>
          + Chegou
        </Button>
      </div>

      {arrival.map((p, i) => (
        <ArrivalRow key={p.id} player={p} n={i + 1} onOpenSheet={onOpenSheet} />
      ))}

      <div className="h-2" />
      <p className="font-body text-xs text-ink-400">
        Toque e segure um nome pra editar, marcar machucado ou tirar da lista.
      </p>
    </div>
  );
}

function ArrivalRow({
  player: p,
  n,
  onOpenSheet,
}: {
  player: Player;
  n: number;
  onOpenSheet: (playerId: string) => void;
}) {
  const isWaiting = !p.team_id;
  const status = p.team_id ? "num time" : p.is_injured ? "machucado" : "esperando";

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
          p.team_id ? "text-ink-500" : p.is_injured ? "text-status-danger" : "text-ink-300",
        ].join(" ")}
      >
        {status}
      </span>
    </PressableRow>
  );
}

function DivididoPorTimes({
  round,
  teams,
  players,
  onOpenSheet,
  onMovePlayer,
  onCreateTeam,
}: {
  round: Round;
  teams: Team[];
  players: Player[];
  onOpenSheet: (playerId: string) => void;
  onMovePlayer: (playerId: string, targetTeamId: string, swapOutPlayerId?: string) => void;
  onCreateTeam: (playerId: string) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [swapPrompt, setSwapPrompt] = useState<{ playerId: string; teamId: string } | null>(
    null,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const ordered = [...teams]
    .filter((t) => t.status !== "done")
    .sort((a, b) => a.label.localeCompare(b.label));
  const waiting = waitingPlayers(players);
  const draggingPlayer = draggingId ? (players.find((p) => p.id === draggingId) ?? null) : null;

  function statusOf(t: Team) {
    if (t.id === round.current_home_team_id || t.id === round.current_away_team_id) {
      return "em campo";
    }
    if (t.status === "queued") return `${t.queue_position ?? 0}º da fila`;
    return "montando";
  }

  function handleDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    if (!e.over) return;
    const playerId = String(e.active.id);
    const overId = String(e.over.id);

    if (overId === NEW_TEAM_DROP_ID) {
      onCreateTeam(playerId);
      return;
    }

    const targetTeam = teams.find((t) => t.id === overId);
    if (!targetTeam) return;
    const roster = players.filter((p) => p.team_id === targetTeam.id);
    if (roster.length >= round.team_size) {
      setSwapPrompt({ playerId, teamId: overId });
    } else {
      onMovePlayer(playerId, overId);
    }
  }

  const swapTeam = swapPrompt ? teams.find((t) => t.id === swapPrompt.teamId) : undefined;
  const swapPlayer = swapPrompt ? players.find((p) => p.id === swapPrompt.playerId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
        {ordered.map((t) => {
          const roster = players.filter((p) => p.team_id === t.id);
          const playing =
            t.id === round.current_home_team_id || t.id === round.current_away_team_id;
          return (
            <TeamCard
              key={t.id}
              team={t}
              roster={roster}
              round={round}
              playing={playing}
              ownTeamOfDragged={!!draggingPlayer && draggingPlayer.team_id === t.id}
              statusLabel={statusOf(t)}
              onOpenSheet={onOpenSheet}
            />
          );
        })}

        <NewTeamDropZone />

        <div>
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-700">
            De fora ({waiting.length})
          </div>
          {waiting.map((p, i) => (
            <WaitingRow key={p.id} player={p} n={i + 1} onOpenSheet={onOpenSheet} />
          ))}
        </div>
      </div>

      <DragOverlay>
        {draggingPlayer && (
          <div className="border-2 border-ink-900 bg-paper px-3 py-2 font-display text-base font-bold shadow-[var(--shadow-raised)]">
            {draggingPlayer.name}
          </div>
        )}
      </DragOverlay>

      {swapPrompt && swapTeam && swapPlayer && (
        <SwapPicker
          playerName={swapPlayer.name}
          team={swapTeam}
          roster={players.filter((p) => p.team_id === swapTeam.id)}
          onPick={(swapOut) => {
            onMovePlayer(swapPrompt.playerId, swapTeam.id, swapOut.id);
            setSwapPrompt(null);
          }}
          onClose={() => setSwapPrompt(null)}
        />
      )}
    </DndContext>
  );
}

function NewTeamDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: NEW_TEAM_DROP_ID });

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex items-center justify-center border-2 border-dashed px-3.5 py-4 font-display text-[13px] font-bold uppercase tracking-[0.12em]",
        isOver ? "border-yellow-500 bg-yellow-100 text-ink-900" : "border-ink-300 text-ink-400",
      ].join(" ")}
    >
      Arrasta aqui pra criar um time novo
    </div>
  );
}

function TeamCard({
  team: t,
  roster,
  round,
  playing,
  ownTeamOfDragged,
  statusLabel,
  onOpenSheet,
}: {
  team: Team;
  roster: Player[];
  round: Round;
  playing: boolean;
  ownTeamOfDragged: boolean;
  statusLabel: string;
  onOpenSheet: (playerId: string) => void;
}) {
  // Playing teams never accept a drop (move_player already refuses that);
  // a player's own team is excluded too — dropping there would be a no-op.
  // Full forming/queued teams ARE droppable — landing there opens the
  // "quem sai" swap step (#25) instead of moving directly.
  const droppable = !playing && !ownTeamOfDragged;
  const { setNodeRef, isOver } = useDroppable({ id: t.id, disabled: !droppable });

  return (
    <div
      ref={setNodeRef}
      className={[
        "border",
        droppable && isOver ? "border-2 border-yellow-500 bg-yellow-100" : "border-ink-200",
      ].join(" ")}
    >
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
          {statusLabel}
        </div>
      </div>
      <div className="grid grid-cols-2">
        {roster.map((p, i) => (
          <TeamRow key={p.id} player={p} n={i + 1} onOpenSheet={onOpenSheet} draggable={!playing} />
        ))}
      </div>
      <div className="border-t border-ink-200 px-3.5 py-2 font-body text-xs text-ink-500">
        {roster.length} de {round.team_size}
        {roster.length >= round.team_size
          ? " — completo"
          : roster.length >= 3
            ? ` — falta ${round.team_size - roster.length}, completa com quem perder`
            : roster.length > 0
              ? ` — falta ${round.team_size - roster.length}, entra por substituição no time que perder`
              : " — falta gente"}
      </div>
    </div>
  );
}

function TeamRow({
  player: p,
  n,
  onOpenSheet,
  draggable,
}: {
  player: Player;
  n: number;
  onOpenSheet: (playerId: string) => void;
  draggable: boolean;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: p.id,
    disabled: !draggable,
  });

  return (
    <PressableRow
      onLongPress={() => onOpenSheet(p.id)}
      className={[
        "flex items-baseline gap-2 border-t border-ink-200 px-3.5 py-2.5",
        isDragging ? "opacity-30" : "",
      ].join(" ")}
      dragHandleProps={draggable ? { setNodeRef, attributes, listeners } : undefined}
    >
      <span className="font-mono-app text-[11px] font-bold text-ink-400">
        {String(n).padStart(2, "0")}
      </span>
      <span className="font-display text-base font-bold">{p.name}</span>
    </PressableRow>
  );
}

function WaitingRow({
  player: p,
  n,
  onOpenSheet,
}: {
  player: Player;
  n: number;
  onOpenSheet: (playerId: string) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: p.id });

  return (
    <PressableRow
      onLongPress={() => onOpenSheet(p.id)}
      className={[
        "flex items-baseline gap-2.5 border-b border-ink-200 py-2.5",
        isDragging ? "opacity-30" : "",
      ].join(" ")}
      dragHandleProps={{ setNodeRef, attributes, listeners }}
    >
      <span className="font-mono-app text-xs font-bold text-ink-400">
        {String(n).padStart(2, "0")}
      </span>
      <span className="flex-1 font-display text-lg font-bold">{p.name}</span>
      {p.is_injured && (
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-status-danger">
          machucado
        </span>
      )}
    </PressableRow>
  );
}
