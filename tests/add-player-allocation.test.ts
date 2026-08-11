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

async function teamsOf(roundId: string) {
  const { data } = await supabase
    .from("teams")
    .select("id, label, status, created_at")
    .eq("round_id", roundId)
    .order("created_at", { ascending: true });
  return data!;
}

async function rosterOf(teamId: string) {
  const { data } = await supabase.from("players").select("id").eq("team_id", teamId);
  return data!;
}

describe("add_player incremental allocation", () => {
  it("leaves the player unassigned before the round's initial draw", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);

    const [player] = await addTestPlayers(round.id, ["Solo"]);
    expect(player.team_id ?? null).toBeNull();
  });

  it("auto-allocates into a new forming team once no existing team has room", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);
    await addTestPlayers(
      round.id,
      Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Player ${i + 1}`),
    );
    await supabase.rpc("confirm_draw", { p_round_id: round.id });

    const [arrival] = await addTestPlayers(round.id, ["New Arrival"]);
    expect(arrival.team_id).not.toBeNull();

    const teams = await teamsOf(round.id);
    expect(teams).toHaveLength(3);
    const newTeam = teams[2];
    expect(newTeam.status).toBe("forming");
    expect(arrival.team_id).toBe(newTeam.id);
  });

  it("fills the same forming team in arrival order until it's full, then starts another", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);
    await addTestPlayers(
      round.id,
      Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Player ${i + 1}`),
    );
    await supabase.rpc("confirm_draw", { p_round_id: round.id });

    const arrivals = await addTestPlayers(
      round.id,
      Array.from({ length: TEAM_SIZE + 1 }, (_, i) => `Extra ${i + 1}`),
    );

    const teams = await teamsOf(round.id);
    expect(teams).toHaveLength(4);
    const thirdTeam = teams[2];
    const fourthTeam = teams[3];

    const thirdRoster = await rosterOf(thirdTeam.id);
    expect(thirdRoster).toHaveLength(TEAM_SIZE);
    expect(thirdRoster.map((p) => p.id).sort()).toEqual(
      arrivals.slice(0, TEAM_SIZE).map((p) => p.id).sort(),
    );

    const fourthRoster = await rosterOf(fourthTeam.id);
    expect(fourthRoster).toHaveLength(1);
    expect(fourthRoster[0].id).toBe(arrivals[TEAM_SIZE].id);
  });

  it("fills the oldest forming team with room first when more than one exists", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);
    await addTestPlayers(
      round.id,
      Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Player ${i + 1}`),
    );
    await supabase.rpc("confirm_draw", { p_round_id: round.id });

    // Simulate a scenario (produced elsewhere, e.g. case 1 in #18) where two
    // forming teams with room already coexist.
    const { data: older } = await supabase
      .from("teams")
      .insert({ round_id: round.id, label: "C", status: "forming" })
      .select()
      .single();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const { data: newer } = await supabase
      .from("teams")
      .insert({ round_id: round.id, label: "D", status: "forming" })
      .select()
      .single();

    const [arrival] = await addTestPlayers(round.id, ["Tiebreak"]);
    expect(arrival.team_id).toBe(older!.id);
    expect(arrival.team_id).not.toBe(newer!.id);
  });
});
