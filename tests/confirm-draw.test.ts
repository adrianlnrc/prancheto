import { afterEach, describe, expect, it } from "vitest";
import {
  addTestPlayers,
  cleanupTestGroup,
  createTestGroup,
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

async function setupRound() {
  const group = await createTestGroup();
  groupId = group.id;
  const round = await startTestRound(group.id, TEAM_SIZE);
  const players = await addTestPlayers(
    round.id,
    Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Player ${i + 1}`),
  );
  return { round, players };
}

async function rosterSizes(roundId: string, teamAId: string, teamBId: string) {
  const { data: players } = await supabase
    .from("players")
    .select("team_id")
    .eq("round_id", roundId);
  const a = players!.filter((p) => p.team_id === teamAId).length;
  const b = players!.filter((p) => p.team_id === teamBId).length;
  return { a, b };
}

describe("confirm_draw balances teams", () => {
  it("splits evenly with no pinned players", async () => {
    const { round } = await setupRound();

    const { data, error } = await supabase.rpc("confirm_draw", {
      p_round_id: round.id,
    });
    expect(error).toBeNull();
    const [{ team_a_id, team_b_id }] = data!;

    const { a, b } = await rosterSizes(round.id, team_a_id, team_b_id);
    expect(a).toBe(TEAM_SIZE);
    expect(b).toBe(TEAM_SIZE);
  });

  it.each(["first", "second"] as const)(
    "splits evenly with exactly one pinned player (%s slot)",
    async (slot) => {
      const { round, players } = await setupRound();

      const { error: pinError } = await supabase.rpc("set_pin", {
        p_player_id: players[0].id,
        p_pin_slot: slot,
      });
      expect(pinError).toBeNull();

      const { data, error } = await supabase.rpc("confirm_draw", {
        p_round_id: round.id,
      });
      expect(error).toBeNull();
      const [{ team_a_id, team_b_id }] = data!;

      const { a, b } = await rosterSizes(round.id, team_a_id, team_b_id);
      expect(a).toBe(TEAM_SIZE);
      expect(b).toBe(TEAM_SIZE);

      const { data: pinnedPlayer } = await supabase
        .from("players")
        .select("team_id")
        .eq("id", players[0].id)
        .single();
      expect(pinnedPlayer!.team_id).toBe(slot === "first" ? team_a_id : team_b_id);
    },
  );

  it("splits evenly with both slots pinned", async () => {
    const { round, players } = await setupRound();

    await supabase.rpc("set_pin", { p_player_id: players[0].id, p_pin_slot: "first" });
    await supabase.rpc("set_pin", { p_player_id: players[1].id, p_pin_slot: "second" });

    const { data, error } = await supabase.rpc("confirm_draw", {
      p_round_id: round.id,
    });
    expect(error).toBeNull();
    const [{ team_a_id, team_b_id }] = data!;

    const { a, b } = await rosterSizes(round.id, team_a_id, team_b_id);
    expect(a).toBe(TEAM_SIZE);
    expect(b).toBe(TEAM_SIZE);

    const { data: pinned } = await supabase
      .from("players")
      .select("id, team_id")
      .in("id", [players[0].id, players[1].id]);
    const p0 = pinned!.find((p) => p.id === players[0].id);
    const p1 = pinned!.find((p) => p.id === players[1].id);
    expect(p0!.team_id).toBe(team_a_id);
    expect(p1!.team_id).toBe(team_b_id);
  });
});
