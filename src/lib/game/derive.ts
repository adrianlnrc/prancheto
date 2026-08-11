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

/** Teams currently waiting their turn, ordered front-to-back of the queue. */
export function queuedTeams(teams: Team[]): Team[] {
  return teams
    .filter((t) => t.status === "queued")
    .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
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
