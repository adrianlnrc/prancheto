import { afterEach, describe, expect, it } from "vitest";
import {
  addTestPlayers,
  cleanupTestGroup,
  createTestGroup,
  rosterSizes,
  startTestRound,
  testClient,
} from "./helpers";

const supabase = testClient();
const TEAM_SIZE = 6;

let groupId: string | undefined;

afterEach(async () => {
  if (groupId) await cleanupTestGroup(groupId);
  groupId = undefined;
});

async function setupDrawnRound(pinSlots: Array<"first" | "second"> = []) {
  const group = await createTestGroup();
  groupId = group.id;
  const round = await startTestRound(group.id, TEAM_SIZE);
  const players = await addTestPlayers(
    round.id,
    Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Player ${i + 1}`),
  );

  for (let i = 0; i < pinSlots.length; i++) {
    await supabase.rpc("set_pin", { p_player_id: players[i].id, p_pin_slot: pinSlots[i] });
  }

  const { data } = await supabase.rpc("confirm_draw", { p_round_id: round.id });
  const [{ team_a_id, team_b_id }] = data!;
  return { round, players, teamAId: team_a_id as string, teamBId: team_b_id as string };
}

async function teamRowCount(roundId: string) {
  const { data } = await supabase.from("teams").select("id, label").eq("round_id", roundId);
  return data!;
}

describe("reshuffle_draw", () => {
  it("reshuffles the same two teams without creating new ones", async () => {
    const { round, teamAId, teamBId } = await setupDrawnRound();
    const before = await teamRowCount(round.id);
    expect(before).toHaveLength(2);

    const { error } = await supabase.rpc("reshuffle_draw", {
      p_round_id: round.id,
      p_team_a_id: teamAId,
      p_team_b_id: teamBId,
    });
    expect(error).toBeNull();

    const after = await teamRowCount(round.id);
    expect(after).toHaveLength(2);
    expect(after.map((t) => t.id).sort()).toEqual(before.map((t) => t.id).sort());

    const { a, b } = await rosterSizes(round.id, teamAId, teamBId);
    expect(a).toBe(TEAM_SIZE);
    expect(b).toBe(TEAM_SIZE);
  });

  it("keeps pinned players in their original team across repeated reshuffles", async () => {
    const { round, players, teamAId, teamBId } = await setupDrawnRound(["first", "second"]);

    for (let i = 0; i < 3; i++) {
      const { error } = await supabase.rpc("reshuffle_draw", {
        p_round_id: round.id,
        p_team_a_id: teamAId,
        p_team_b_id: teamBId,
      });
      expect(error).toBeNull();

      const { data: pinned } = await supabase
        .from("players")
        .select("id, team_id")
        .in("id", [players[0].id, players[1].id]);
      const p0 = pinned!.find((p) => p.id === players[0].id);
      const p1 = pinned!.find((p) => p.id === players[1].id);
      expect(p0!.team_id).toBe(teamAId);
      expect(p1!.team_id).toBe(teamBId);

      const { a, b } = await rosterSizes(round.id, teamAId, teamBId);
      expect(a).toBe(TEAM_SIZE);
      expect(b).toBe(TEAM_SIZE);
    }
  });

  it("stays balanced with a single pinned player across repeated reshuffles", async () => {
    const { round, teamAId, teamBId } = await setupDrawnRound(["first"]);

    for (let i = 0; i < 3; i++) {
      const { error } = await supabase.rpc("reshuffle_draw", {
        p_round_id: round.id,
        p_team_a_id: teamAId,
        p_team_b_id: teamBId,
      });
      expect(error).toBeNull();

      const { a, b } = await rosterSizes(round.id, teamAId, teamBId);
      expect(a).toBe(TEAM_SIZE);
      expect(b).toBe(TEAM_SIZE);
    }
  });

  it("refuses to reshuffle a team that already has a recorded match", async () => {
    const { round, teamAId, teamBId } = await setupDrawnRound();

    const { error: matchError } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(matchError).toBeNull();

    const { error } = await supabase.rpc("reshuffle_draw", {
      p_round_id: round.id,
      p_team_a_id: teamAId,
      p_team_b_id: teamBId,
    });
    expect(error).not.toBeNull();
  });
});
