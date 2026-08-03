-- Pin search_path on all functions (fixes function_search_path_mutable advisor warnings).
alter function start_round(uuid, int) set search_path = public;
alter function add_player(uuid, text) set search_path = public;
alter function set_pin(uuid, text) set search_path = public;
alter function confirm_draw(uuid) set search_path = public;
alter function record_match_result(uuid, text) set search_path = public;
alter function mark_injured(uuid) set search_path = public;

-- Cover foreign keys that lacked an index (fixes unindexed_foreign_keys advisor notices).
create index matches_home_team_id_idx on matches(home_team_id);
create index matches_away_team_id_idx on matches(away_team_id);
create index players_team_id_idx on players(team_id);
create index rounds_group_id_idx on rounds(group_id);
create index rounds_current_home_team_idx on rounds(current_home_team_id);
create index rounds_current_away_team_idx on rounds(current_away_team_id);
