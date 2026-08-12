export type Group = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
};

export type RoundStatus = "open" | "closed";

export type Round = {
  id: string;
  group_id: string;
  team_size: number;
  status: RoundStatus;
  current_home_team_id: string | null;
  current_away_team_id: string | null;
  created_at: string;
  closed_at: string | null;
};

export type TeamStatus = "forming" | "queued" | "playing" | "done";

export type Team = {
  id: string;
  round_id: string;
  label: string;
  status: TeamStatus;
  queue_position: number | null;
  formed_at: string | null;
  created_at: string;
};

export type Player = {
  id: string;
  round_id: string;
  name: string;
  arrival_order: number;
  team_id: string | null;
  joined_at: string;
};

export type MatchWinner = "home" | "away";

export type Match = {
  id: string;
  round_id: string;
  home_team_id: string;
  away_team_id: string;
  winner: MatchWinner;
  created_at: string;
};
