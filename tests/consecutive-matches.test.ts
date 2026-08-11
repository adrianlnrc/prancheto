import { afterEach, describe, expect, it } from "vitest";
import {
  addTestPlayers,
  cleanupTestGroup,
  createTestGroup,
  insertPlayerDirect,
  insertTestTeam,
  insertWaitingPlayer,
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

async function streakOf(playerId: string) {
  const { data } = await supabase
    .from("players")
    .select("consecutive_matches")
    .eq("id", playerId)
    .single();
  return data!.consecutive_matches as number;
}

async function rosterIds(teamId: string) {
  const { data } = await supabase.from("players").select("id").eq("team_id", teamId);
  return data!.map((p) => p.id as string);
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

describe("consecutive_matches streak", () => {
  it("increments the winner's roster and the loser's when the queue is empty", async () => {
    const { round, homeId, awayId } = await setupPlayingRound();
    const home = await rosterIds(homeId);
    const away = await rosterIds(awayId);

    await supabase.rpc("record_match_result", { p_round_id: round.id, p_winner: "home" });

    for (const id of home) expect(await streakOf(id)).toBe(1);
    for (const id of away) expect(await streakOf(id)).toBe(1);
  });

  it("keeps incrementing across repeated wins", async () => {
    const { round, homeId } = await setupPlayingRound();
    const home = await rosterIds(homeId);

    await supabase.rpc("record_match_result", { p_round_id: round.id, p_winner: "home" });
    await supabase.rpc("record_match_result", { p_round_id: round.id, p_winner: "home" });
    await supabase.rpc("record_match_result", { p_round_id: round.id, p_winner: "home" });

    for (const id of home) expect(await streakOf(id)).toBe(3);
  });

  it("increments the loser's roster too when its team isn't dissolved", async () => {
    const { round, awayId } = await setupPlayingRound();
    const nextTeam = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", nextTeam.id);
    for (let i = 0; i < TEAM_SIZE; i++) {
      await insertPlayerDirect(round.id, `Q${i + 1}`, nextTeam.id);
    }
    const away = await rosterIds(awayId);

    await supabase.rpc("record_match_result", { p_round_id: round.id, p_winner: "home" });

    for (const id of away) expect(await streakOf(id)).toBe(1);
  });

  it("resets everyone on a case-1 dissolved loser team, fill and leftover alike", async () => {
    const { round, awayId } = await setupPlayingRound();
    const loserRoster = await rosterIds(awayId);
    // Prove the reset actually does something, not just leaves a zero at zero.
    await supabase.from("players").update({ consecutive_matches: 3 }).in("id", loserRoster);

    const nextTeam = await insertTestTeam(round.id, "C", "queued");
    await supabase.from("teams").update({ queue_position: 1 }).eq("id", nextTeam.id);
    for (let i = 0; i < TEAM_SIZE - 1; i++) {
      await insertPlayerDirect(round.id, `Q${i + 1}`, nextTeam.id);
    }

    await supabase.rpc("record_match_result", { p_round_id: round.id, p_winner: "home" });

    for (const id of loserRoster) expect(await streakOf(id)).toBe(0);
  });

  it("resets both players in a move_player swap", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, TEAM_SIZE);
    const teamX = await insertTestTeam(round.id, "X", "forming");
    const teamY = await insertTestTeam(round.id, "Y", "forming");
    const p1 = await insertPlayerDirect(round.id, "P1", teamX.id);
    const q1 = await insertPlayerDirect(round.id, "Q1", teamY.id);
    await insertPlayerDirect(round.id, "Q2", teamY.id);
    await insertPlayerDirect(round.id, "Q3", teamY.id);
    await insertPlayerDirect(round.id, "Q4", teamY.id);
    await supabase.from("players").update({ consecutive_matches: 5 }).in("id", [p1.id, q1.id]);

    await supabase.rpc("move_player", {
      p_player_id: p1.id,
      p_target_team_id: teamY.id,
      p_swap_out_player_id: q1.id,
    });

    expect(await streakOf(p1.id)).toBe(0);
    expect(await streakOf(q1.id)).toBe(0);
  });

  it("resets the injured player and starts the replacement at zero", async () => {
    const { round, homeId } = await setupPlayingRound();
    const home = await rosterIds(homeId);
    await supabase.rpc("record_match_result", { p_round_id: round.id, p_winner: "home" });
    expect(await streakOf(home[0])).toBe(1);

    const waiting = await insertWaitingPlayer(round.id, "Waiting");
    await supabase.from("players").update({ consecutive_matches: 9 }).eq("id", waiting.id);

    await supabase.rpc("mark_injured", { p_player_id: home[0] });

    expect(await streakOf(home[0])).toBe(0);
    expect(await streakOf(waiting.id)).toBe(0);
  });

  it("starts the replacement at zero after remove_player", async () => {
    const { round, homeId } = await setupPlayingRound();
    const home = await rosterIds(homeId);
    await supabase.rpc("record_match_result", { p_round_id: round.id, p_winner: "home" });

    const waiting = await insertWaitingPlayer(round.id, "Waiting");
    await supabase.from("players").update({ consecutive_matches: 9 }).eq("id", waiting.id);

    await supabase.rpc("remove_player", { p_player_id: home[0] });

    expect(await streakOf(waiting.id)).toBe(0);
  });
});
