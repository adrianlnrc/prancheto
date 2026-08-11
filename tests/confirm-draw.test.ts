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

describe("confirm_draw balances teams", () => {
  it("splits evenly and sends both teams straight to playing", async () => {
    const { round } = await setupRound();

    const { data, error } = await supabase.rpc("confirm_draw", {
      p_round_id: round.id,
    });
    expect(error).toBeNull();
    const [{ team_a_id, team_b_id }] = data!;

    const { a, b } = await rosterSizes(round.id, team_a_id, team_b_id);
    expect(a).toBe(TEAM_SIZE);
    expect(b).toBe(TEAM_SIZE);

    const { data: updatedRound } = await supabase
      .from("rounds")
      .select("current_home_team_id, current_away_team_id")
      .eq("id", round.id)
      .single();
    expect([updatedRound!.current_home_team_id, updatedRound!.current_away_team_id].sort()).toEqual(
      [team_a_id, team_b_id].sort(),
    );

    const { data: teamRows } = await supabase
      .from("teams")
      .select("status")
      .in("id", [team_a_id, team_b_id]);
    expect(teamRows!.every((t) => t.status === "playing")).toBe(true);
  });

  it("refuses a second draw on the same round", async () => {
    const { round } = await setupRound();

    const { error: firstError } = await supabase.rpc("confirm_draw", { p_round_id: round.id });
    expect(firstError).toBeNull();

    await addTestPlayers(
      round.id,
      Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Extra ${i + 1}`),
    );

    const { error: secondError } = await supabase.rpc("confirm_draw", { p_round_id: round.id });
    expect(secondError).not.toBeNull();
  });

  it("refuses a draw before enough players have arrived", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);
    await addTestPlayers(round.id, ["Only One"]);

    const { error } = await supabase.rpc("confirm_draw", { p_round_id: round.id });
    expect(error).not.toBeNull();
  });
});
