import { afterEach, describe, expect, it } from "vitest";
import {
  addTestPlayers,
  cleanupTestGroup,
  createTestGroup,
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

    const waiting = await addTestPlayers(round.id, ["Waiting One"]);

    const { data: teamAPlayers } = await supabase
      .from("players")
      .select("id")
      .eq("round_id", round.id)
      .eq("team_id", team_a_id);
    const targetId = teamAPlayers![0].id as string;

    const { error } = await supabase.rpc("remove_player", { p_player_id: targetId });
    expect(error).toBeNull();

    expect(await playerExists(targetId)).toBe(false);
    expect(await teamIdOf(waiting[0].id)).toBe(team_a_id);
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

  it("skips injured players when picking a replacement", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);
    await addTestPlayers(
      round.id,
      Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Player ${i + 1}`),
    );
    const { data: draw } = await supabase.rpc("confirm_draw", { p_round_id: round.id });
    const [{ team_a_id }] = draw!;

    const extras = await addTestPlayers(round.id, ["Injured Extra", "Healthy Extra"]);
    await supabase.rpc("mark_injured", { p_player_id: extras[0].id });

    const { data: teamAPlayers } = await supabase
      .from("players")
      .select("id")
      .eq("round_id", round.id)
      .eq("team_id", team_a_id);
    const targetId = teamAPlayers![0].id as string;

    const { error } = await supabase.rpc("remove_player", { p_player_id: targetId });
    expect(error).toBeNull();
    expect(await teamIdOf(extras[1].id)).toBe(team_a_id);
  });
});
