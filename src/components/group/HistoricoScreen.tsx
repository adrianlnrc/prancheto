"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Match, Round, Team } from "@/lib/types";
import { matchLabel, summarizeRound } from "@/lib/game/derive";

export function HistoricoScreen({
  pastRounds,
  onFechar,
}: {
  pastRounds: Round[];
  onFechar: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<
    Record<string, { teams: Team[]; matches: Match[] }>
  >({});

  async function toggle(round: Round) {
    if (openId === round.id) {
      setOpenId(null);
      return;
    }
    setOpenId(round.id);
    if (!detail[round.id]) {
      const supabase = createClient();
      const [{ data: teams }, { data: matches }] = await Promise.all([
        supabase.from("teams").select("*").eq("round_id", round.id),
        supabase
          .from("matches")
          .select("*")
          .eq("round_id", round.id)
          .order("created_at", { ascending: true }),
      ]);
      setDetail((d) => ({
        ...d,
        [round.id]: { teams: teams ?? [], matches: matches ?? [] },
      }));
    }
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
        <div className="font-display text-lg font-black leading-[1.1] tracking-[-0.01em]">
          Jogos passados
        </div>
        <button
          onClick={onFechar}
          className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500"
        >
          Fechar
        </button>
      </div>

      <div className="flex-1 overflow-auto px-5 py-2">
        {pastRounds.length === 0 && (
          <p className="py-6 text-center font-body text-sm text-ink-500">
            Nenhum jogo encerrado ainda.
          </p>
        )}
        {pastRounds.map((r) => {
          const open = openId === r.id;
          const d = detail[r.id];
          return (
            <div
              key={r.id}
              onClick={() => toggle(r)}
              className="cursor-pointer border-b border-ink-200 py-4"
            >
              <div className="flex items-baseline gap-3">
                <div className="flex-1">
                  <div className="font-display text-[21px] font-black leading-[1.1]">
                    {new Date(r.created_at).toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "2-digit",
                      month: "short",
                    })}
                  </div>
                  <div className="font-body text-[13px] leading-[1.6] text-ink-500">
                    {d ? summarizeRound(d.teams, d.matches) : `${r.team_size} por time`}
                  </div>
                </div>
                <span className="font-display text-base font-bold text-ink-400">
                  {open ? "–" : "+"}
                </span>
              </div>
              {open && d && (
                <div className="mt-3.5 flex flex-col gap-2 border-l-2 border-yellow-500 pl-3.5">
                  {d.matches.map((m) => (
                    <div key={m.id} className="font-display text-[15px] font-bold text-ink-700">
                      {matchLabel(m, d.teams)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
