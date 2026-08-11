import { afterEach, describe, expect, it } from "vitest";
import {
  addTestPlayers,
  cleanupTestGroup,
  createTestGroup,
  insertPlayerDirect,
  insertTestTeam,
  startTestRound,
  testClient,
} from "./helpers";

const supabase = testClient();
const TEAM_SIZE = 4;

let groupId: string | undefined;

async function rosterIds(teamId: string) {
  const { data } = await supabase
    .from("players")
    .select("id, arrival_order")
    .eq("team_id", teamId)
    .order("arrival_order", { ascending: true });
  return data!.map((p) => p.id as string);
}

async function roundState(roundId: string) {
  const { data } = await supabase
    .from("rounds")
    .select("current_home_team_id, current_away_team_id")
    .eq("id", roundId)
    .single();
  return data!;
}

async function teamStatus(teamId: string) {
  const { data } = await supabase.from("teams").select("status").eq("id", teamId).single();
  return data!.status as string;
}

afterEach(async () => {
  if (groupId) await cleanupTestGroup(groupId);
  groupId = undefined;
});

async function setupPlayingRound() {
  const group = await createTestGroup();
  groupId = group.id;
  const round = await startTestRound(group.id, TEAM_SIZE);
  await addTestPlayers(
    round.id,
    Array.from({ length: TEAM_SIZE * 2 }, (_, i) => `Player ${i + 1}`),
  );
  const { data: draw } = await supabase.rpc("confirm_draw", { p_round_id: round.id });
  const [{ team_a_id, team_b_id }] = draw!;
  return { round, homeId: team_a_id as string, awayId: team_b_id as string };
}

describe("record_match_result", () => {
  it("rejects draw as a winner", async () => {
    const { round } = await setupPlayingRound();
    const { error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "draw",
    });
    expect(error).not.toBeNull();
  });

  it("keeps the same two teams playing when the queue is empty", async () => {
    const { round, homeId, awayId } = await setupPlayingRound();

    const { error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(error).toBeNull();

    const state = await roundState(round.id);
    expect(state.current_home_team_id).toBe(homeId);
    expect(state.current_away_team_id).toBe(awayId);
    expect(await teamStatus(homeId)).toBe("playing");
    expect(await teamStatus(awayId)).toBe("playing");
    expect(await rosterIds(awayId)).toHaveLength(TEAM_SIZE);
  });

  it("brings in an already-complete queued team as before, loser to the back", async () => {
    const { round, homeId, awayId } = await setupPlayingRound();
    const nextTeam = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", nextTeam.id);
    for (let i = 0; i < TEAM_SIZE; i++) {
      await insertPlayerDirect(round.id, `Q${i + 1}`, nextTeam.id);
    }

    const { error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(error).toBeNull();

    const state = await roundState(round.id);
    expect(state.current_home_team_id).toBe(homeId);
    expect(state.current_away_team_id).toBe(nextTeam.id);
    expect(await teamStatus(nextTeam.id)).toBe("playing");
    expect(await teamStatus(awayId)).toBe("queued");
    expect(await rosterIds(awayId)).toHaveLength(TEAM_SIZE);
  });

  it("case 1: tops off a 3+ incomplete queued team with the loser's oldest arrivals", async () => {
    const { round, awayId } = await setupPlayingRound();
    const loserRoster = await rosterIds(awayId);
    expect(loserRoster).toHaveLength(TEAM_SIZE);
    const expectedFill = loserRoster[0];
    const expectedLeftover = loserRoster.slice(1);

    const nextTeam = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", nextTeam.id);
    const incompleteRoster: string[] = [];
    for (let i = 0; i < TEAM_SIZE - 1; i++) {
      const p = await insertPlayerDirect(round.id, `Q${i + 1}`, nextTeam.id);
      incompleteRoster.push(p.id);
    }

    const { error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(error).toBeNull();

    const nextRoster = await rosterIds(nextTeam.id);
    expect(nextRoster).toHaveLength(TEAM_SIZE);
    expect(nextRoster).toEqual(expect.arrayContaining([...incompleteRoster, expectedFill]));

    const state = await roundState(round.id);
    expect(state.current_away_team_id).toBe(nextTeam.id);
    expect(await teamStatus(nextTeam.id)).toBe("playing");
    expect(await teamStatus(awayId)).toBe("done");

    // Leftover loser players stay together, forming a new team.
    const { data: leftoverRows } = await supabase
      .from("players")
      .select("id, team_id")
      .in("id", expectedLeftover);
    const leftoverTeamIds = new Set(leftoverRows!.map((p) => p.team_id));
    expect(leftoverTeamIds.size).toBe(1);
    const [leftoverTeamId] = [...leftoverTeamIds];
    expect(leftoverTeamId).not.toBe(awayId);
    expect(leftoverTeamId).not.toBe(nextTeam.id);
    expect(await teamStatus(leftoverTeamId as string)).toBe("forming");
  });

  it("brings in a queued team with fewer than 3 players as-is (interim, pre-#20)", async () => {
    const { round, awayId } = await setupPlayingRound();
    const nextTeam = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", nextTeam.id);
    const p1 = await insertPlayerDirect(round.id, "Q1", nextTeam.id);
    const p2 = await insertPlayerDirect(round.id, "Q2", nextTeam.id);

    const { error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(error).toBeNull();

    const nextRoster = await rosterIds(nextTeam.id);
    expect(nextRoster.sort()).toEqual([p1.id, p2.id].sort());
    expect(await teamStatus(nextTeam.id)).toBe("playing");
    expect(await teamStatus(awayId)).toBe("queued");
    expect(await rosterIds(awayId)).toHaveLength(TEAM_SIZE);

    const state = await roundState(round.id);
    expect(state.current_away_team_id).toBe(nextTeam.id);
  });
});
