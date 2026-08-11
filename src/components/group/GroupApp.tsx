"use client";

import { useEffect, useState } from "react";
import { useGroupRealtime } from "@/hooks/useGroupRealtime";
import { getSavedName, saveName } from "@/lib/localName";
import {
  addPlayer,
  confirmDraw,
  markInjured,
  movePlayer,
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

/** Builds the post-match summary from what record_match_result actually did
 * — never guessed ahead of time, since the loser doesn't always fully leave
 * (case 1) and sometimes doesn't leave at all (case 2). */
function posResultFromOutcome(result: MatchOutcome): PosResult {
  const winner = `Time ${result.winner_label}`;
  const title = `${winner} ficou.`;

  switch (result.outcome) {
    case "no_change":
      return {
        title,
        subtitle: "Ninguém disponível pra substituir agora — os times continuam os mesmos.",
        saiLabel: "ninguém",
        entraLabel: "ninguém",
        depoisLabel: "—",
      };
    case "case1":
      return {
        title,
        subtitle: `Time ${result.entering_label} entra incompleto, completado por quem perdeu.`,
        saiLabel: `Time ${result.loser_label}`,
        entraLabel: `Time ${result.entering_label}`,
        depoisLabel: "—",
      };
    case "case2":
      return {
        title,
        subtitle: `Time ${result.loser_label} continua — só troca quem tava jogando sem parar.`,
        saiLabel: result.subs_out.join(", "),
        entraLabel: result.subs_in.join(", "),
        depoisLabel: "—",
      };
    case "full_swap":
    default:
      return {
        title,
        subtitle: "Perdeu sai. Entra o próximo da fila.",
        saiLabel: `Time ${result.loser_label}`,
        entraLabel: `Time ${result.entering_label}`,
        depoisLabel: "—",
      };
  }
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
      teams={data.teams}
      players={data.players}
      teamSize={round.team_size}
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
          onGoChegada={() => setScreen("jogadores")}
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
      />
      {sheet}
    </Shell>
  );
}
