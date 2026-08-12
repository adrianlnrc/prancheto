"use client";

import { useEffect, useState } from "react";
import { useGroupRealtime } from "@/hooks/useGroupRealtime";
import { getSavedName, saveName } from "@/lib/localName";
import {
  addPlayer,
  confirmDraw,
  createTeam,
  movePlayer,
  playerLeave,
  recordMatchResult,
  removePlayer,
  renamePlayer,
  reshuffleDraw,
  startRound,
  type MatchOutcome,
} from "@/lib/game/actions";
import { EntrarScreen } from "./EntrarScreen";
import { SemRodadaScreen } from "./SemRodadaScreen";
import { JogadoresScreen } from "./JogadoresScreen";
import { FilaScreen } from "./FilaScreen";
import { PosScreen, type PosResult } from "./PosScreen";
import { HistoricoScreen } from "./HistoricoScreen";
import { PlayerActionSheet } from "./PlayerActionSheet";

type Screen = "jogadores" | "fila" | "pos" | "historico";

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="relative flex min-h-dvh flex-1 flex-col">{children}</div>;
}

function Loading() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="pran-now font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400">
        Carregando<span className="text-yellow-500">.</span>
      </div>
    </main>
  );
}

/** Builds the post-match summary from what record_match_result actually did
 * — never guessed ahead of time, since the loser sometimes stays on court
 * (no_change) when there's nobody left to bring in. */
function posResultFromOutcome(result: MatchOutcome): PosResult {
  const winner = `Time ${result.winner_label}`;
  const title = `${winner} ficou.`;

  if (result.outcome === "no_change") {
    return {
      title,
      subtitle: "Ninguém disponível pra substituir agora — os times continuam os mesmos.",
      saiLabel: "ninguém",
      entraLabel: "ninguém",
      depoisLabel: "—",
    };
  }

  return {
    title,
    subtitle: "Perdeu sai. Entra o próximo da fila.",
    saiLabel: `Time ${result.loser_label}`,
    entraLabel: `Time ${result.entering_label}`,
    depoisLabel: result.subs_in.length > 0 ? `Reforçado por ${result.subs_in.join(", ")}` : "—",
  };
}

export function GroupApp({ slug }: { slug: string }) {
  const data = useGroupRealtime(slug);
  const [myName, setMyName] = useState<string | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>("jogadores");
  const [posResult, setPosResult] = useState<PosResult | null>(null);
  const [sheetPlayerId, setSheetPlayerId] = useState<string | null>(null);

  useEffect(() => {
    // Reads localStorage — an external system, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMyName(getSavedName(slug));
  }, [slug]);

  if (myName === undefined || data.loading) {
    return <Shell><Loading /></Shell>;
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

  if (!data.group) return <Shell><Loading /></Shell>;

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
      teams={data.teams}
      players={data.players}
      teamSize={round.team_size}
      onClose={() => setSheetPlayerId(null)}
      onRename={async (name) => {
        if (sheetPlayer) await renamePlayer(sheetPlayer.id, name);
        setSheetPlayerId(null);
      }}
      onSair={async () => {
        if (sheetPlayer) await playerLeave(sheetPlayer.id);
        setSheetPlayerId(null);
      }}
      onRemover={async () => {
        if (sheetPlayer) await removePlayer(sheetPlayer.id);
        setSheetPlayerId(null);
      }}
      onMove={async (targetTeamId, swapOutPlayerId) => {
        if (sheetPlayer) await movePlayer(sheetPlayer.id, targetTeamId, swapOutPlayerId);
        setSheetPlayerId(null);
      }}
    />
  );

  if (screen === "historico") {
    return (
      <Shell>
        <HistoricoScreen pastRounds={data.pastRounds} onFechar={() => setScreen("jogadores")} />
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
            setScreen("jogadores");
          }}
        />
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
          onGoTimes={() => setScreen("jogadores")}
          onVenceu={async (winner) => {
            const result = await recordMatchResult(round.id, winner);
            setPosResult(posResultFromOutcome(result));
            setScreen("pos");
          }}
        />
        {sheet}
      </Shell>
    );
  }

  return (
    <Shell>
      <JogadoresScreen
        group={data.group}
        round={round}
        players={data.players}
        teams={data.teams}
        onGoFila={() => setScreen("fila")}
        onAddPlayer={(name) => addPlayer(round.id, name)}
        onOpenSheet={setSheetPlayerId}
        onSortear={() => confirmDraw(round.id)}
        onSortearNovo={(teamAId, teamBId) => reshuffleDraw(round.id, teamAId, teamBId)}
        onMovePlayer={(playerId, targetTeamId, swapOutPlayerId) =>
          movePlayer(playerId, targetTeamId, swapOutPlayerId)
        }
        onCreateTeam={async (playerId) => {
          const team = await createTeam(round.id);
          await movePlayer(playerId, team.id);
        }}
      />
      {sheet}
    </Shell>
  );
}
