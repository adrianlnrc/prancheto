import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupTestGroup,
  createTestGroup,
  insertPlayerDirect,
  insertTestTeam,
  insertWaitingPlayer,
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

async function newRound() {
  const group = await createTestGroup();
  groupId = group.id;
  return startTestRound(group.id, TEAM_SIZE);
}

describe("move_player", () => {
  it("moves a player straight into a team with room", async () => {
    const round = await newRound();
    const teamX = await insertTestTeam(round.id, "X", "forming");
    const teamY = await insertTestTeam(round.id, "Y", "forming");
    const p1 = await insertPlayerDirect(round.id, "P1", teamX.id);
    const p2 = await insertPlayerDirect(round.id, "P2", teamY.id);

    const { error } = await supabase.rpc("move_player", {
      p_player_id: p2.id,
      p_target_team_id: teamX.id,
    });
    expect(error).toBeNull();

    expect(await teamIdOf(p2.id)).toBe(teamX.id);
    expect(await teamIdOf(p1.id)).toBe(teamX.id);
  });

  it("swaps mutually when the target team is full", async () => {
    const round = await newRound();
    const teamX = await insertTestTeam(round.id, "X", "forming");
    const teamY = await insertTestTeam(round.id, "Y", "forming");
    const p1 = await insertPlayerDirect(round.id, "P1", teamX.id);
    const q1 = await insertPlayerDirect(round.id, "Q1", teamY.id);
    const q2 = await insertPlayerDirect(round.id, "Q2", teamY.id);
    const q3 = await insertPlayerDirect(round.id, "Q3", teamY.id);

    const { error } = await supabase.rpc("move_player", {
      p_player_id: p1.id,
      p_target_team_id: teamY.id,
      p_swap_out_player_id: q1.id,
    });
    expect(error).toBeNull();

    expect(await teamIdOf(p1.id)).toBe(teamY.id);
    expect(await teamIdOf(q1.id)).toBe(teamX.id);
    expect(await teamIdOf(q2.id)).toBe(teamY.id);
    expect(await teamIdOf(q3.id)).toBe(teamY.id);
  });

  it("refuses to move into a full team without a swap_out player", async () => {
    const round = await newRound();
    const teamX = await insertTestTeam(round.id, "X", "forming");
    const teamY = await insertTestTeam(round.id, "Y", "forming");
    const p1 = await insertPlayerDirect(round.id, "P1", teamX.id);
    await insertPlayerDirect(round.id, "Q1", teamY.id);
    await insertPlayerDirect(round.id, "Q2", teamY.id);
    await insertPlayerDirect(round.id, "Q3", teamY.id);

    const { error } = await supabase.rpc("move_player", {
      p_player_id: p1.id,
      p_target_team_id: teamY.id,
    });
    expect(error).not.toBeNull();
  });

  it("refuses a swap_out player who isn't actually on the target team", async () => {
    const round = await newRound();
    const teamX = await insertTestTeam(round.id, "X", "forming");
    const teamY = await insertTestTeam(round.id, "Y", "forming");
    const teamZ = await insertTestTeam(round.id, "Z", "forming");
    const p1 = await insertPlayerDirect(round.id, "P1", teamX.id);
    const outsider = await insertPlayerDirect(round.id, "Outsider", teamZ.id);
    await insertPlayerDirect(round.id, "Q1", teamY.id);
    await insertPlayerDirect(round.id, "Q2", teamY.id);
    await insertPlayerDirect(round.id, "Q3", teamY.id);

    const { error } = await supabase.rpc("move_player", {
      p_player_id: p1.id,
      p_target_team_id: teamY.id,
      p_swap_out_player_id: outsider.id,
    });
    expect(error).not.toBeNull();
  });

  it("refuses to move a player out of a team that is playing", async () => {
    const round = await newRound();
    const teamX = await insertTestTeam(round.id, "X", "playing");
    const teamY = await insertTestTeam(round.id, "Y", "forming");
    const p1 = await insertPlayerDirect(round.id, "P1", teamX.id);

    const { error } = await supabase.rpc("move_player", {
      p_player_id: p1.id,
      p_target_team_id: teamY.id,
    });
    expect(error).not.toBeNull();
  });

  it("refuses to move a player into a team that is playing", async () => {
    const round = await newRound();
    const teamX = await insertTestTeam(round.id, "X", "forming");
    const teamY = await insertTestTeam(round.id, "Y", "playing");
    const p1 = await insertPlayerDirect(round.id, "P1", teamX.id);

    const { error } = await supabase.rpc("move_player", {
      p_player_id: p1.id,
      p_target_team_id: teamY.id,
    });
    expect(error).not.toBeNull();
  });

  it("refuses to move a player into a team that is done", async () => {
    const round = await newRound();
    const teamX = await insertTestTeam(round.id, "X", "forming");
    const teamY = await insertTestTeam(round.id, "Y", "done");
    const p1 = await insertPlayerDirect(round.id, "P1", teamX.id);

    const { error } = await supabase.rpc("move_player", {
      p_player_id: p1.id,
      p_target_team_id: teamY.id,
    });
    expect(error).not.toBeNull();
  });

  it("refuses to move a player out of a team that is done", async () => {
    const round = await newRound();
    const teamX = await insertTestTeam(round.id, "X", "done");
    const teamY = await insertTestTeam(round.id, "Y", "forming");
    const p1 = await insertPlayerDirect(round.id, "P1", teamX.id);

    const { error } = await supabase.rpc("move_player", {
      p_player_id: p1.id,
      p_target_team_id: teamY.id,
    });
    expect(error).not.toBeNull();
  });

  it("moving a waiting player into a full team sends the swapped-out player to the waiting pool", async () => {
    const round = await newRound();
    const teamY = await insertTestTeam(round.id, "Y", "forming");
    const q1 = await insertPlayerDirect(round.id, "Q1", teamY.id);
    await insertPlayerDirect(round.id, "Q2", teamY.id);
    await insertPlayerDirect(round.id, "Q3", teamY.id);
    const waiting = await insertWaitingPlayer(round.id, "Waiting");

    const { error } = await supabase.rpc("move_player", {
      p_player_id: waiting.id,
      p_target_team_id: teamY.id,
      p_swap_out_player_id: q1.id,
    });
    expect(error).toBeNull();

    expect(await teamIdOf(waiting.id)).toBe(teamY.id);
    expect(await teamIdOf(q1.id)).toBeNull();
  });
});
