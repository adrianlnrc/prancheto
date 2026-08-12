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

async function teamIdOf(playerId: string) {
  const { data } = await supabase.from("players").select("team_id").eq("id", playerId).single();
  return data!.team_id as string | null;
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

    const { data, error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(error).toBeNull();
    expect(data![0].outcome).toBe("no_change");

    const state = await roundState(round.id);
    expect(state.current_home_team_id).toBe(homeId);
    expect(state.current_away_team_id).toBe(awayId);
    expect(await teamStatus(homeId)).toBe("playing");
    expect(await teamStatus(awayId)).toBe("playing");
    expect(await rosterIds(awayId)).toHaveLength(TEAM_SIZE);
  });

  it("brings in an already-complete queued team, loser dissolves to the tail of the queue", async () => {
    const { round, homeId, awayId } = await setupPlayingRound();
    const loserRoster = await rosterIds(awayId);
    const nextTeam = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", nextTeam.id);
    for (let i = 0; i < TEAM_SIZE; i++) {
      await insertPlayerDirect(round.id, `Q${i + 1}`, nextTeam.id);
    }

    const { data, error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(error).toBeNull();
    expect(data![0].outcome).toBe("rotated");
    expect(data![0].loser_label).toBe("B");
    expect(data![0].entering_label).toBe("C");
    expect(data![0].subs_in).toEqual([]); // already full, nobody pulled from the queue

    const state = await roundState(round.id);
    expect(state.current_home_team_id).toBe(homeId);
    expect(state.current_away_team_id).toBe(nextTeam.id);
    expect(await teamStatus(nextTeam.id)).toBe("playing");
    expect(await teamStatus(awayId)).toBe("done");

    // The whole loser roster went back to team_id null — nobody is stranded.
    for (const id of loserRoster) {
      expect(await teamIdOf(id)).toBeNull();
    }
  });

  it("tops off a short queued team with the dissolved loser's players, in original order", async () => {
    const { round, awayId } = await setupPlayingRound();
    const loserRoster = await rosterIds(awayId);

    const nextTeam = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", nextTeam.id);
    const incompleteRoster: string[] = [];
    for (let i = 0; i < TEAM_SIZE - 1; i++) {
      const p = await insertPlayerDirect(round.id, `Q${i + 1}`, nextTeam.id);
      incompleteRoster.push(p.id);
    }

    const { data, error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(error).toBeNull();
    expect(data![0].outcome).toBe("rotated");
    expect(data![0].entering_label).toBe("C");
    expect(data![0].loser_label).toBe("B");

    // Only the first arrival of the dissolved loser was needed to top C off.
    const nextRoster = await rosterIds(nextTeam.id);
    expect(nextRoster).toHaveLength(TEAM_SIZE);
    expect(nextRoster).toEqual(expect.arrayContaining([...incompleteRoster, loserRoster[0]]));

    const state = await roundState(round.id);
    expect(state.current_away_team_id).toBe(nextTeam.id);
    expect(await teamStatus(nextTeam.id)).toBe("playing");
    expect(await teamStatus(awayId)).toBe("done");

    // The rest of the loser waits, nobody left team-less permanently.
    for (const id of loserRoster.slice(1)) {
      expect(await teamIdOf(id)).toBeNull();
    }
  });

  it("cascades into a second team down the queue once the first is topped off", async () => {
    const { round, awayId } = await setupPlayingRound();
    const loserRoster = await rosterIds(awayId); // 4 players

    const teamC = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", teamC.id);
    const cRoster: string[] = [];
    for (let i = 0; i < TEAM_SIZE - 1; i++) {
      const p = await insertPlayerDirect(round.id, `C${i + 1}`, teamC.id);
      cRoster.push(p.id);
    }

    const teamD = await insertTestTeam(round.id, "D", "forming");
    const dRoster: string[] = [];
    for (let i = 0; i < TEAM_SIZE - 2; i++) {
      const p = await insertPlayerDirect(round.id, `D${i + 1}`, teamD.id);
      dRoster.push(p.id);
    }

    const { error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(error).toBeNull();

    // C needed 1, took the loser's first arrival. D needed 2, took the
    // loser's next two — exactly enough to fill it. The loser's last player
    // has nowhere left to go.
    expect(await rosterIds(teamC.id)).toHaveLength(TEAM_SIZE);
    const dRosterAfter = await rosterIds(teamD.id);
    expect(dRosterAfter).toHaveLength(TEAM_SIZE);
    expect(dRosterAfter).toEqual(expect.arrayContaining([...dRoster, loserRoster[1], loserRoster[2]]));
    expect(await teamIdOf(loserRoster[3])).toBeNull();
  });

  it("reported bug: a short third team still fully replaces the loser, not just part of it", async () => {
    // Time A (home) vs Time B (away) em quadra; Time C na fila, faltando 2.
    const { round, homeId, awayId } = await setupPlayingRound();
    const loserRoster = await rosterIds(awayId);

    const teamC = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", teamC.id);
    const cRoster: string[] = [];
    for (let i = 0; i < TEAM_SIZE - 2; i++) {
      const p = await insertPlayerDirect(round.id, `C${i + 1}`, teamC.id);
      cRoster.push(p.id);
    }

    const { data, error } = await supabase.rpc("record_match_result", {
      p_round_id: round.id,
      p_winner: "home",
    });
    expect(error).toBeNull();
    expect(data![0].outcome).toBe("rotated");

    // Time B (the loser) is fully replaced by Time C, not left stuck.
    const state = await roundState(round.id);
    expect(state.current_home_team_id).toBe(homeId);
    expect(state.current_away_team_id).toBe(teamC.id);
    expect(await teamStatus(teamC.id)).toBe("playing");
    expect(await teamStatus(awayId)).toBe("done");

    const cRosterAfter = await rosterIds(teamC.id);
    expect(cRosterAfter).toHaveLength(TEAM_SIZE);
    expect(cRosterAfter).toEqual(
      expect.arrayContaining([...cRoster, loserRoster[0], loserRoster[1]]),
    );

    const { data: subInNames } = await supabase
      .from("players")
      .select("name")
      .in("id", [loserRoster[0], loserRoster[1]]);
    expect(data![0].subs_in.sort()).toEqual(subInNames!.map((p) => p.name).sort());
  });
});
