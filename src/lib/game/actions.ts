import { customAlphabet } from "nanoid";
import { createClient } from "@/lib/supabase/client";
import type { Group, Team } from "@/lib/types";

const slugSuffix = customAlphabet("abcdefghijkmnopqrstuvwxyz23456789", 5);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 30);
}

/** Creates a group with a fixed, permanent slug. Retries on rare slug collisions. */
export async function createGroup(name: string): Promise<Group> {
  const supabase = createClient();
  const base = slugify(name) || "pelada";

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `${base}-${slugSuffix()}`;
    const { data, error } = await supabase
      .from("groups")
      .insert({ name, slug })
      .select("*")
      .single();

    if (!error) return data;
    if (error.code !== "23505") throw error; // not a unique-violation, don't retry
  }
  throw new Error("could not generate a unique group link");
}

export async function startRound(groupId: string, teamSize: number) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("start_round", {
    p_group_id: groupId,
    p_team_size: teamSize,
  });
  if (error) throw error;
  return data;
}

export async function addPlayer(roundId: string, name: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("add_player", {
    p_round_id: roundId,
    p_name: name,
  });
  if (error) throw error;
  return data;
}

export async function confirmDraw(roundId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("confirm_draw", {
    p_round_id: roundId,
  });
  if (error) throw error;
  return data;
}

export async function reshuffleDraw(roundId: string, teamAId: string, teamBId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("reshuffle_draw", {
    p_round_id: roundId,
    p_team_a_id: teamAId,
    p_team_b_id: teamBId,
  });
  if (error) throw error;
}

export type MatchOutcome = {
  outcome: "no_change" | "rotated";
  winner_label: string;
  loser_label: string;
  entering_label: string | null;
  subs_in: string[];
  subs_out: string[];
};

export async function recordMatchResult(
  roundId: string,
  winner: "home" | "away",
): Promise<MatchOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("record_match_result", {
    p_round_id: roundId,
    p_winner: winner,
  });
  if (error) throw error;
  return data[0] as MatchOutcome;
}

export async function createTeam(roundId: string): Promise<Team> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_team", { p_round_id: roundId });
  if (error) throw error;
  return data as Team;
}

export async function movePlayer(playerId: string, targetTeamId: string, swapOutPlayerId?: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("move_player", {
    p_player_id: playerId,
    p_target_team_id: targetTeamId,
    p_swap_out_player_id: swapOutPlayerId ?? null,
  });
  if (error) throw error;
}

export async function playerLeave(playerId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("player_leave", { p_player_id: playerId });
  if (error) throw error;
}

export async function removePlayer(playerId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("remove_player", { p_player_id: playerId });
  if (error) throw error;
}

export async function renamePlayer(playerId: string, name: string) {
  const supabase = createClient();
  const { error } = await supabase.from("players").update({ name }).eq("id", playerId);
  if (error) throw error;
}
