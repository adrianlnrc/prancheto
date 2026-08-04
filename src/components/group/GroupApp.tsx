"use client";

import { useEffect, useState } from "react";
import { useGroupRealtime } from "@/hooks/useGroupRealtime";
import { getSavedName, saveName } from "@/lib/localName";
import {
  addPlayer,
  confirmDraw,
  markInjured,
  recordMatchResult,
  removePlayer,
  renamePlayer,
  reshuffleDraw,
  setPin,
  startRound,
} from "@/lib/game/actions";
import { queuedTeams } from "@/lib/game/derive";
import { EntrarScreen } from "./EntrarScreen";
import { SemRodadaScreen } from "./SemRodadaScreen";
import { ChegadaScreen } from "./ChegadaScreen";
import { SorteioScreen } from "./SorteioScreen";
import { FilaScreen } from "./FilaScreen";
import { TimesScreen } from "./TimesScreen";
import { PosScreen, type PosResult } from "./PosScreen";
import { HistoricoScreen } from "./HistoricoScreen";
import { PlayerActionSheet } from "./PlayerActionSheet";

type Screen = "chegada" | "sorteio" | "fila" | "times" | "pos" | "historico";

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="relative flex min-h-dvh flex-1 flex-col">{children}</div>;
}

export function GroupApp({ slug }: { slug: string }) {
  const data = useGroupRealtime(slug);
  const [myName, setMyName] = useState<string | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>("chegada");
  const [sorteando, setSorteando] = useState(false);
  const [lastDraw, setLastDraw] = useState<{ a: string; b: string } | null>(null);
  const [posResult, setPosResult] = useState<PosResult | null>(null);
  const [sheetPlayerId, setSheetPlayerId] = useState<string | null>(null);

  useEffect(() => {
    // Reads localStorage — an external system, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMyName(getSavedName(slug));
  }, [slug]);

  if (myName === undefined || data.loading) {
    return <Shell><div /></Shell>;
  }

  if (data.error === "group-not-found") {
    return (
      <Shell>
        <main className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <p className="font-display text-lg font-bold">Essa pelada não existe.</p>
          <p className="pt-2 font-body text-sm text-ink-500">
            Confere o link com quem te mandou.
          </p>
        </main>
      </Shell>
    );
  }

  if (!data.group) return <Shell><div /></Shell>;

  if (!myName) {
    return (
      <Shell>
        <EntrarScreen
          group={data.group}
          onEntrar={(name) => {
            saveName(slug, name);
            setMyName(name);
          }}
        />
      </Shell>
    );
  }

  if (!data.round) {
    return (
      <Shell>
        <SemRodadaScreen
          group={data.group}
          pastRounds={data.pastRounds}
          onIniciar={async (teamSize) => {
            await startRound(data.group!.id, teamSize);
          }}
          onHistorico={() => setScreen("historico")}
        />
      </Shell>
    );
  }

  const round = data.round;
  const sheetPlayer = data.players.find((p) => p.id === sheetPlayerId) ?? null;

  const sheet = (
    <PlayerActionSheet
      player={sheetPlayer}
      onClose={() => setSheetPlayerId(null)}
      onRename={async (name) => {
        if (sheetPlayer) await renamePlayer(sheetPlayer.id, name);
        setSheetPlayerId(null);
      }}
      onLesionado={async () => {
        if (sheetPlayer) await markInjured(sheetPlayer.id);
        setSheetPlayerId(null);
      }}
      onRemover={async () => {
        if (sheetPlayer) await removePlayer(sheetPlayer.id);
        setSheetPlayerId(null);
      }}
      onFixar={async (slot) => {
        if (sheetPlayer) await setPin(sheetPlayer.id, slot);
        setSheetPlayerId(null);
      }}
    />
  );

  if (screen === "historico") {
    return (
      <Shell>
        <HistoricoScreen pastRounds={data.pastRounds} onFechar={() => setScreen("chegada")} />
      </Shell>
    );
  }

  if (screen === "sorteio" && lastDraw) {
    return (
      <Shell>
        <SorteioScreen
          teamA={data.teams.find((t) => t.id === lastDraw.a)}
          teamB={data.teams.find((t) => t.id === lastDraw.b)}
          players={data.players}
          sorteando={sorteando}
          onVoltar={() => {
            setLastDraw(null);
            setScreen("chegada");
          }}
          onSortearNovo={async () => {
            setSorteando(true);
            try {
              await reshuffleDraw(round.id, lastDraw.a, lastDraw.b);
            } finally {
              setSorteando(false);
            }
          }}
        />
      </Shell>
    );
  }

  if (screen === "pos" && posResult) {
    return (
      <Shell>
        <PosScreen
          result={posResult}
          onVoltar={() => {
            setPosResult(null);
            setScreen("chegada");
          }}
        />
      </Shell>
    );
  }

  if (screen === "times") {
    return (
      <Shell>
        <TimesScreen
          round={round}
          teams={data.teams}
          players={data.players}
          onGoFila={() => setScreen("fila")}
          onOpenSheet={setSheetPlayerId}
        />
        {sheet}
      </Shell>
    );
  }

  if (screen === "fila") {
    return (
      <Shell>
        <FilaScreen
          round={round}
          teams={data.teams}
          players={data.players}
          onGoTimes={() => setScreen("times")}
          onGoChegada={() => setScreen("chegada")}
          onVenceu={async (winner) => {
            const home = data.teams.find((t) => t.id === round.current_home_team_id);
            const away = data.teams.find((t) => t.id === round.current_away_team_id);
            const queue = queuedTeams(data.teams);
            const winnerTeam = winner === "home" ? home : away;
            const loserTeam = winner === "home" ? away : home;
            setPosResult({
              title: `Time ${winnerTeam?.label ?? "?"} ficou.`,
              subtitle: "Perdeu sai. Entra o próximo da fila.",
              saiLabel: `Time ${loserTeam?.label ?? "?"}`,
              entraLabel: queue[0] ? `Time ${queue[0].label}` : "ninguém ainda",
              depoisLabel: queue[1] ? `Time ${queue[1].label}` : "—",
            });
            setScreen("pos");
            await recordMatchResult(round.id, winner);
          }}
          onEmpate={async () => {
            const home = data.teams.find((t) => t.id === round.current_home_team_id);
            const away = data.teams.find((t) => t.id === round.current_away_team_id);
            const queue = queuedTeams(data.teams);
            setPosResult({
              title: "Deu empate.",
              subtitle: "Saem os dois. Entram os próximos.",
              saiLabel: `Time ${home?.label ?? "?"} e Time ${away?.label ?? "?"}`,
              entraLabel: queue[0] ? `Time ${queue[0].label}` : "ninguém ainda",
              depoisLabel: queue[1] ? `Time ${queue[1].label}` : "—",
            });
            setScreen("pos");
            await recordMatchResult(round.id, "draw");
          }}
        />
        {sheet}
      </Shell>
    );
  }

  return (
    <Shell>
      <ChegadaScreen
        group={data.group}
        round={round}
        players={data.players}
        onGoTimes={() => setScreen("times")}
        onGoFila={() => setScreen("fila")}
        onAddPlayer={(name) => addPlayer(round.id, name)}
        onOpenSheet={setSheetPlayerId}
        sorteando={sorteando}
        onSortear={async () => {
          setSorteando(true);
          try {
            const result = await confirmDraw(round.id);
            const row = Array.isArray(result) ? result[0] : result;
            if (row) {
              setLastDraw({ a: row.team_a_id, b: row.team_b_id });
              setScreen("sorteio");
            }
          } finally {
            setSorteando(false);
          }
        }}
      />
      {sheet}
    </Shell>
  );
}
