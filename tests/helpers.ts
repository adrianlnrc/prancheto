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
    players.push(data as { id: string; name: string });
  }
  return players;
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
