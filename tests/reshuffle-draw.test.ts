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

async function setupDrawnRound() {
  const group = await createTestGroup();
  groupId = group.id;
  const round = await startTestRound(group.id, TEAM_SIZE);
  const players = await addTestPlayers(
    round.id,
    Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Player ${i + 1}`),
  );

  const { data } = await supabase.rpc("confirm_draw", { p_round_id: round.id });
  const [{ team_a_id, team_b_id }] = data!;
  return { round, players, teamAId: team_a_id as string, teamBId: team_b_id as string };
}

async function teamRowCount(roundId: string) {
  const { data } = await supabase.from("teams").select("id, label").eq("round_id", roundId);
  return data!;
}

async function teamAMembers(roundId: string, teamAId: string) {
  const { data } = await supabase
    .from("players")
    .select("id")
    .eq("round_id", roundId)
    .eq("team_id", teamAId);
  return data!
    .map((p) => p.id)
    .sort()
    .join(",");
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

  it("actually changes who's on each team across repeated reshuffles", async () => {
    // Balanced counts alone don't prove anything moved — a no-op reshuffle
    // leaves counts balanced too, since it started that way. Assert the
    // membership itself varies across enough tries to rule out a no-op.
    const { round, teamAId, teamBId } = await setupDrawnRound();

    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const { error } = await supabase.rpc("reshuffle_draw", {
        p_round_id: round.id,
        p_team_a_id: teamAId,
        p_team_b_id: teamBId,
      });
      expect(error).toBeNull();
      seen.add(await teamAMembers(round.id, teamAId));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("stays balanced across repeated reshuffles", async () => {
    const { round, teamAId, teamBId } = await setupDrawnRound();

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
