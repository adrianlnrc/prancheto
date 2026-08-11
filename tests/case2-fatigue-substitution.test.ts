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

afterEach(async () => {
  if (groupId) await cleanupTestGroup(groupId);
  groupId = undefined;
});

async function rosterIds(teamId: string) {
  const { data } = await supabase
    .from("players")
    .select("id, consecutive_matches, arrival_order")
    .eq("team_id", teamId)
    .order("arrival_order", { ascending: true });
  return data!;
}

async function playerRow(playerId: string) {
  const { data } = await supabase
    .from("players")
    .select("team_id, consecutive_matches")
    .eq("id", playerId)
    .single();
  return data!;
}

async function teamStatus(teamId: string) {
  const { data } = await supabase.from("teams").select("status").eq("id", teamId).single();
  return data!.status as string;
}

async function roundState(roundId: string) {
  const { data } = await supabase
    .from("rounds")
    .select("current_home_team_id, current_away_team_id")
    .eq("id", roundId)
    .single();
  return data!;
}

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

describe("record_match_result — case 2 (fatigue substitution)", () => {
  it("subs out the single most-fatigued loser player when only 1 is available", async () => {
    const { round, homeId, awayId } = await setupPlayingRound();
    const loser = await rosterIds(awayId);
    // Make the second-arrival player the clear most-fatigued one.
    await supabase
      .from("players")
      .update({ consecutive_matches: 5 })
      .eq("id", loser[1].id);

    const nextTeam = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", nextTeam.id);
    const sub = await insertPlayerDirect(round.id, "Sub", nextTeam.id);

    const { data, error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(error).toBeNull();
    expect(data![0].outcome).toBe("case2");
    expect(data![0].subs_in).toEqual(["Sub"]);
    expect(data![0].subs_out).toHaveLength(1);

    // Loser keeps playing, unchanged in the round.
    const state = await roundState(round.id);
    expect(state.current_home_team_id).toBe(homeId);
    expect(state.current_away_team_id).toBe(awayId);
    expect(await teamStatus(awayId)).toBe("playing");
    expect(await teamStatus(nextTeam.id)).toBe("done");

    // The fatigued player left for the waiting pool, reset to zero.
    const swappedOut = await playerRow(loser[1].id);
    expect(swappedOut.team_id).toBeNull();
    expect(swappedOut.consecutive_matches).toBe(0);

    // The substitute is now on the loser's roster, starting at zero.
    const subRow = await playerRow(sub.id);
    expect(subRow.team_id).toBe(awayId);
    expect(subRow.consecutive_matches).toBe(0);

    // Everyone else on the loser stayed and incremented.
    const awayRosterAfter = await rosterIds(awayId);
    const stayedIds = loser.filter((p) => p.id !== loser[1].id).map((p) => p.id);
    for (const id of stayedIds) {
      const row = awayRosterAfter.find((p) => p.id === id);
      expect(row).toBeDefined();
      expect(row!.consecutive_matches).toBe(1);
    }
    expect(awayRosterAfter).toHaveLength(TEAM_SIZE);
  });

  it("subs out the two most-fatigued loser players when 2 are available", async () => {
    const { round, awayId } = await setupPlayingRound();
    const loser = await rosterIds(awayId);
    await supabase.from("players").update({ consecutive_matches: 7 }).eq("id", loser[0].id);
    await supabase.from("players").update({ consecutive_matches: 5 }).eq("id", loser[1].id);

    const nextTeam = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", nextTeam.id);
    const sub1 = await insertPlayerDirect(round.id, "Sub1", nextTeam.id);
    const sub2 = await insertPlayerDirect(round.id, "Sub2", nextTeam.id);

    const { error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(error).toBeNull();

    expect((await playerRow(loser[0].id)).team_id).toBeNull();
    expect((await playerRow(loser[1].id)).team_id).toBeNull();
    expect((await playerRow(sub1.id)).team_id).toBe(awayId);
    expect((await playerRow(sub2.id)).team_id).toBe(awayId);
    expect(await teamStatus(nextTeam.id)).toBe("done");

    const awayRosterAfter = await rosterIds(awayId);
    expect(awayRosterAfter).toHaveLength(TEAM_SIZE);
  });

  it("breaks streak ties by earliest arrival", async () => {
    const { round, awayId } = await setupPlayingRound();
    const loser = await rosterIds(awayId);
    // Everyone tied at the same streak — earliest arrival_order should be picked.
    await supabase
      .from("players")
      .update({ consecutive_matches: 2 })
      .in("id", loser.map((p) => p.id));

    const nextTeam = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", nextTeam.id);
    await insertPlayerDirect(round.id, "Sub", nextTeam.id);

    await supabase.rpc("record_match_result", { p_round_id: round.id, p_winner: "home" });

    const oldestLoserPlayer = loser[0].id;
    expect((await playerRow(oldestLoserPlayer)).team_id).toBeNull();
  });

  it("discards an empty queued team and leaves the loser fully intact", async () => {
    const { round, homeId, awayId } = await setupPlayingRound();
    const loserBefore = await rosterIds(awayId);

    const emptyTeam = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", emptyTeam.id);

    const { error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(error).toBeNull();

    expect(await teamStatus(emptyTeam.id)).toBe("done");
    const state = await roundState(round.id);
    expect(state.current_home_team_id).toBe(homeId);
    expect(state.current_away_team_id).toBe(awayId);

    const loserAfter = await rosterIds(awayId);
    expect(loserAfter.map((p) => p.id).sort()).toEqual(loserBefore.map((p) => p.id).sort());
    for (const p of loserAfter) expect(p.consecutive_matches).toBe(1);
  });
});
