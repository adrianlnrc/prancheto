import { afterEach, describe, expect, it } from "vitest";
import {
  addTestPlayers,
  cleanupTestGroup,
  createTestGroup,
  insertWaitingPlayer,
  startTestRound,
  testClient,
} from "./helpers";

const supabase = testClient();
const TEAM_SIZE = 3;

let groupId: string | undefined;

afterEach(async () => {
  if (groupId) await cleanupTestGroup(groupId);
  groupId = undefined;
});

async function teamIdOf(playerId: string) {
  const { data } = await supabase.from("players").select("team_id").eq("id", playerId).single();
  return data!.team_id as string | null;
}

describe("player_leave", () => {
  it("frees the player and pulls in the first player waiting", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);
    await addTestPlayers(
      round.id,
      Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Player ${i + 1}`),
    );
    const { data: draw } = await supabase.rpc("confirm_draw", { p_round_id: round.id });
    const [{ team_a_id }] = draw!;

    const earlier = await insertWaitingPlayer(round.id, "Earlier");
    const later = await insertWaitingPlayer(round.id, "Later");

    const { data: teamAPlayers } = await supabase
      .from("players")
      .select("id")
      .eq("round_id", round.id)
      .eq("team_id", team_a_id);
    const leavingId = teamAPlayers![0].id as string;

    const { error } = await supabase.rpc("player_leave", { p_player_id: leavingId });
    expect(error).toBeNull();

    expect(await teamIdOf(leavingId)).toBeNull();
    expect(await teamIdOf(earlier.id)).toBe(team_a_id);
    expect(await teamIdOf(later.id)).toBeNull();
  });

  it("works the same whether the player is on court or on the bench", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);
    const players = await addTestPlayers(round.id, ["Solo A", "Solo B"]);
    const bench = players[0].id;
    const sub = await insertWaitingPlayer(round.id, "Sub");

    // Bench player has no team yet (round has no teams formed) — leaving
    // just sends them to the tail of the queue, no replacement to pull in.
    const { error } = await supabase.rpc("player_leave", { p_player_id: bench });
    expect(error).toBeNull();
    expect(await teamIdOf(bench)).toBeNull();
    expect(await teamIdOf(sub.id)).toBeNull();
  });

  it("sends the leaving player to the tail of the general queue", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);
    await addTestPlayers(
      round.id,
      Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Player ${i + 1}`),
    );
    const { data: draw } = await supabase.rpc("confirm_draw", { p_round_id: round.id });
    const [{ team_a_id }] = draw!;

    const { data: teamAPlayers } = await supabase
      .from("players")
      .select("id")
      .eq("round_id", round.id)
      .eq("team_id", team_a_id);
    const leavingId = teamAPlayers![0].id as string;

    const before = await supabase
      .from("players")
      .select("arrival_order")
      .eq("round_id", round.id)
      .order("arrival_order", { ascending: false })
      .limit(1)
      .single();

    await supabase.rpc("player_leave", { p_player_id: leavingId });

    const after = await supabase
      .from("players")
      .select("arrival_order")
      .eq("id", leavingId)
      .single();
    expect(after.data!.arrival_order).toBeGreaterThan(before.data!.arrival_order);
  });
});
