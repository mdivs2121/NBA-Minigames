"""
build_season_teams.py - All-NBA, All-Defense, and All-Rookie teams for the
Name the Team game (a Hindsight tab).

Reads End of Season Teams.csv and Player Per Game.csv and writes
data/season_teams.json: every team from 1979-80 on:

  [ { season, type, number, players: [ { id, name, pos, team, ppg, rpg, apg } ] }, ... ]

pos is G, F, or C from the position he played that season (the site shows it
as a hint). team is the team he finished that season with. A few teams have
6 or 7 players because of ties in the voting.

Run:  python3 build_season_teams.py
"""
import json
import re

import pandas as pd

from paths import OUT_DIR, STATS_DIR

FIRST_SEASON = 1980
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")
SLOT = {"PG": "G", "SG": "G", "SF": "F", "PF": "F", "C": "C"}


def season_label(end_year):
    return f"{end_year - 1}-{str(end_year)[-2:]}"


def main():
    teams = pd.read_csv(STATS_DIR / "End of Season Teams.csv")
    teams = teams[(teams["lg"] == "NBA") & (teams["season"] >= FIRST_SEASON)]
    per_game = pd.read_csv(STATS_DIR / "Player Per Game.csv").reset_index()
    per_game = per_game[per_game["lg"] == "NBA"]
    totals = per_game[per_game["team"].str.match(SUMMARY_TEAM).fillna(False)].set_index(["player_id", "season"])
    single = per_game[~per_game["team"].str.match(SUMMARY_TEAM).fillna(False)]
    last_team = single.sort_values("index").groupby(["player_id", "season"])["team"].last()
    line = single.drop_duplicates(["player_id", "season"]).set_index(["player_id", "season"])

    out = []
    for (season, kind, number), group in teams.groupby(["season", "type", "number_tm"]):
        players = []
        for r in group.itertuples():
            key = (r.player_id, season)
            row = totals.loc[key] if key in totals.index else line.loc[key] if key in line.index else None
            pos = row["pos"].split("-")[0] if row is not None and isinstance(row["pos"], str) else None
            players.append({
                "id": r.player_id, "name": r.player,
                "pos": SLOT.get(pos) or (r.position if isinstance(r.position, str) else None),
                "team": last_team.get(key),
                "ppg": None if row is None else round(float(row["pts_per_game"]), 1),
                "rpg": None if row is None else round(float(row["trb_per_game"]), 1),
                "apg": None if row is None else round(float(row["ast_per_game"]), 1),
            })
        players.sort(key=lambda p: ({"G": 0, "F": 1, "C": 2}.get(p["pos"], 3), p["name"]))
        out.append({"season": season_label(int(season)), "type": kind, "number": number, "players": players})

    out.sort(key=lambda t: (t["season"], t["type"], t["number"]))
    path = OUT_DIR / "season_teams.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    missing = sum(1 for t in out for p in t["players"] if not p["pos"] or not p["team"])
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(out)} teams, players missing a position or team: {missing}")
    sample = next(t for t in out if t["season"] == "2015-16" and t["type"] == "All-NBA" and t["number"] == "1st")
    print("  2015-16 All-NBA 1st:", ", ".join(f"{p['name']} ({p['pos']}, {p['team']})" for p in sample["players"]))


if __name__ == "__main__":
    main()
