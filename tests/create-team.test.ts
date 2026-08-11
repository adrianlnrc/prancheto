import { afterEach, describe, expect, it } from "vitest";
import { cleanupTestGroup, createTestGroup, startTestRound, testClient } from "./helpers";

const supabase = testClient();

let groupId: string | undefined;

afterEach(async () => {
  if (groupId) await cleanupTestGroup(groupId);
  groupId = undefined;
});

describe("create_team", () => {
  it("creates an empty forming team with label A for a fresh round", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, 6);

    const { data, error } = await supabase.rpc("create_team", { p_round_id: round.id });
    expect(error).toBeNull();
    const team = data as { id: string; round_id: string; label: string; status: string };
    expect(team.round_id).toBe(round.id);
    expect(team.label).toBe("A");
    expect(team.status).toBe("forming");

    const { data: roster } = await supabase.from("players").select("id").eq("team_id", team.id);
    expect(roster).toHaveLength(0);
  });

  it("picks the next free sequential label across repeated calls", async () => {
    const group = await createTestGroup();
    groupId = group.id;
    const round = await startTestRound(group.id, 6);

    const { data: first } = await supabase.rpc("create_team", { p_round_id: round.id });
    const { data: second } = await supabase.rpc("create_team", { p_round_id: round.id });
    const { data: third } = await supabase.rpc("create_team", { p_round_id: round.id });

    expect((first as { label: string }).label).toBe("A");
    expect((second as { label: string }).label).toBe("B");
    expect((third as { label: string }).label).toBe("C");
  });
});
