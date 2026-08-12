import type { Match, Player, Round, Team } from "@/lib/types";

/** Players not yet assigned to a team, in arrival order — the live queue. */
export function waitingPlayers(players: Player[]): Player[] {
  return players
    .filter((p) => !p.team_id)
    .sort((a, b) => a.arrival_order - b.arrival_order);
}

/** How many more arrivals are needed before the next draw unlocks. */
export function missingForNextDraw(players: Player[], teamSize: number): number {
  const waiting = waitingPlayers(players).length;
  return Math.max(0, teamSize * 2 - waiting);
}

export function canDraw(players: Player[], teamSize: number): boolean {
  return missingForNextDraw(players, teamSize) === 0;
}

export function playersByTeam(players: Player[], teamId: string): Player[] {
  return players.filter((p) => p.team_id === teamId);
}

/** Teams currently waiting their turn, ordered front-to-back of the queue.
 * Includes incomplete ("forming") teams — record_match_result brings
 * whoever's next in line onto the court even if it's short-staffed, so a
 * forming team is a real candidate to enter, not just queued ones. */
export function queuedTeams(teams: Team[]): Team[] {
  return teams
    .filter((t) => t.status === "queued" || t.status === "forming")
    .sort((a, b) => {
      const aQueued = a.queue_position != null;
      const bQueued = b.queue_position != null;
      if (aQueued !== bQueued) return aQueued ? -1 : 1;
      if (aQueued && bQueued) return (a.queue_position as number) - (b.queue_position as number);
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
}

export function playingTeams(round: Round, teams: Team[]): { home: Team | null; away: Team | null } {
  return {
    home: teams.find((t) => t.id === round.current_home_team_id) ?? null,
    away: teams.find((t) => t.id === round.current_away_team_id) ?? null,
  };
}

/** Human summary line for a closed round, used on the Histórico screen. */
export function summarizeRound(teams: Team[], matches: Match[]): string {
  const teamCount = teams.length;
  const matchCount = matches.length;
  const streak = longestStreak(matches);
  const base = `${teamCount} times · ${matchCount} ${matchCount === 1 ? "partida" : "partidas"}`;
  if (!streak) return base;
  const teamLabel = teams.find((t) => t.id === streak.teamId)?.label ?? "?";
  return `${base} · Time ${teamLabel} ficou ${streak.count} seguidas`;
}

function longestStreak(matches: Match[]): { teamId: string; count: number } | null {
  let best: { teamId: string; count: number } | null = null;
  let current: { teamId: string; count: number } | null = null;

  for (const m of matches) {
    const winnerId = m.winner === "home" ? m.home_team_id : m.away_team_id;
    if (current && current.teamId === winnerId) {
      current = { teamId: winnerId, count: current.count + 1 };
    } else {
      current = { teamId: winnerId, count: 1 };
    }
    if (!best || current.count > best.count) best = current;
  }
  return best;
}

export function matchLabel(m: Match, teams: Team[]): string {
  const home = teams.find((t) => t.id === m.home_team_id)?.label ?? "?";
  const away = teams.find((t) => t.id === m.away_team_id)?.label ?? "?";
  const winnerLabel = m.winner === "home" ? home : away;
  const loserLabel = m.winner === "home" ? away : home;
  return `Time ${winnerLabel} venceu Time ${loserLabel}`;
}
