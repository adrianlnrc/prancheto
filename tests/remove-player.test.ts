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

async function playerExists(playerId: string) {
  const { data } = await supabase.from("players").select("id").eq("id", playerId).maybeSingle();
  return data !== null;
}

describe("remove_player", () => {
  it("replaces on the spot when the removed player is on a team that's playing", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);
    await addTestPlayers(
      round.id,
      Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Player ${i + 1}`),
    );
    const { data: draw } = await supabase.rpc("confirm_draw", { p_round_id: round.id });
    const [{ team_a_id }] = draw!;

    const waiting = await insertWaitingPlayer(round.id, "Waiting One");

    const { data: teamAPlayers } = await supabase
      .from("players")
      .select("id")
      .eq("round_id", round.id)
      .eq("team_id", team_a_id);
    const targetId = teamAPlayers![0].id as string;

    const { error } = await supabase.rpc("remove_player", { p_player_id: targetId });
    expect(error).toBeNull();

    expect(await playerExists(targetId)).toBe(false);
    expect(await teamIdOf(waiting.id)).toBe(team_a_id);
  });

  it("leaves the team short when nobody is waiting to replace", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);
    const players = await addTestPlayers(
      round.id,
      Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Player ${i + 1}`),
    );
    await supabase.rpc("confirm_draw", { p_round_id: round.id });

    const { error } = await supabase.rpc("remove_player", { p_player_id: players[0].id });
    expect(error).toBeNull();
    expect(await playerExists(players[0].id)).toBe(false);
  });

  it("just removes a waiting player with no team, no replacement attempted", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);
    const players = await addTestPlayers(round.id, ["Solo"]);

    const { error } = await supabase.rpc("remove_player", { p_player_id: players[0].id });
    expect(error).toBeNull();
    expect(await playerExists(players[0].id)).toBe(false);
  });

  it("picks the earliest-arrived waiting player as the replacement", async () => {
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
    const targetId = teamAPlayers![0].id as string;

    const { error } = await supabase.rpc("remove_player", { p_player_id: targetId });
    expect(error).toBeNull();
    expect(await teamIdOf(earlier.id)).toBe(team_a_id);
    expect(await teamIdOf(later.id)).toBeNull();
  });
});
