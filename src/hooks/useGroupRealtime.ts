"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Group, Match, Player, Round, Team } from "@/lib/types";

export type GroupData = {
  loading: boolean;
  error: string | null;
  group: Group | null;
  round: Round | null;
  pastRounds: Round[];
  teams: Team[];
  players: Player[];
  matches: Match[];
  refresh: () => Promise<void>;
};

/** Loads a group by slug and keeps its active round, teams, players and
 * matches in sync in real time across every device with the link open. */
export function useGroupRealtime(slug: string): GroupData {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [pastRounds, setPastRounds] = useState<Round[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  const load = useCallback(async () => {
    const { data: groupRow, error: groupError } = await supabase
      .from("groups")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (groupError) {
      setError(groupError.message);
      setLoading(false);
      return;
    }
    if (!groupRow) {
      setError("group-not-found");
      setLoading(false);
      return;
    }
    setGroup(groupRow);

    const { data: rounds } = await supabase
      .from("rounds")
      .select("*")
      .eq("group_id", groupRow.id)
      .order("created_at", { ascending: false });

    const openRound = rounds?.find((r) => r.status === "open") ?? null;
    setRound(openRound);
    setPastRounds((rounds ?? []).filter((r) => r.status === "closed"));

    if (openRound) {
      const [{ data: teamRows }, { data: playerRows }, { data: matchRows }] =
        await Promise.all([
          supabase.from("teams").select("*").eq("round_id", openRound.id),
          supabase
            .from("players")
            .select("*")
            .eq("round_id", openRound.id)
            .order("arrival_order", { ascending: true }),
          supabase
            .from("matches")
            .select("*")
            .eq("round_id", openRound.id)
            .order("created_at", { ascending: true }),
        ]);
      setTeams(teamRows ?? []);
      setPlayers(playerRows ?? []);
      setMatches(matchRows ?? []);
    } else {
      setTeams([]);
      setPlayers([]);
      setMatches([]);
    }

    setLoading(false);
  }, [slug, supabase]);

  useEffect(() => {
    // Initial fetch from Supabase — an external system, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`group:${slug}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teams" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [slug, supabase, load]);

  return {
    loading,
    error,
    group,
    round,
    pastRounds,
    teams,
    players,
    matches,
    refresh: load,
  };
}
