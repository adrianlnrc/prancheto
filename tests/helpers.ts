import { createClient } from "@supabase/supabase-js";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("abcdefghijkmnopqrstuvwxyz23456789", 8);

export function testClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

const supabase = testClient();

export async function createTestGroup() {
  const slug = `test-${nanoid()}`;
  const { data, error } = await supabase
    .from("groups")
    .insert({ name: "Test group", slug })
    .select("*")
    .single();
  if (error) throw error;
  return data as { id: string; slug: string };
}

export async function startTestRound(groupId: string, teamSize: number) {
  const { data, error } = await supabase.rpc("start_round", {
    p_group_id: groupId,
    p_team_size: teamSize,
  });
  if (error) throw error;
  return data as { id: string };
}

export async function addTestPlayers(roundId: string, names: string[]) {
  const players = [];
  for (const name of names) {
    const { data, error } = await supabase.rpc("add_player", {
      p_round_id: roundId,
      p_name: name,
    });
    if (error) throw error;
    players.push(data as { id: string; name: string; team_id: string | null });
  }
  return players;
}

// Inserts a player directly (bypassing add_player's auto-allocation, see #16)
// so tests can construct a genuinely unassigned "waiting" player even after
// a round's teams already exist.
export async function insertWaitingPlayer(roundId: string, name: string) {
  const { data: maxOrder } = await supabase
    .from("players")
    .select("arrival_order")
    .eq("round_id", roundId)
    .order("arrival_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("players")
    .insert({
      round_id: roundId,
      name,
      arrival_order: (maxOrder?.arrival_order ?? 0) + 1,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as { id: string; name: string; team_id: string | null };
}

export async function cleanupTestGroup(groupId: string) {
  await supabase.from("groups").delete().eq("id", groupId);
}

export async function rosterSizes(roundId: string, teamAId: string, teamBId: string) {
  const { data: players } = await supabase
    .from("players")
    .select("team_id")
    .eq("round_id", roundId);
  const a = players!.filter((p) => p.team_id === teamAId).length;
  const b = players!.filter((p) => p.team_id === teamBId).length;
  return { a, b };
}
