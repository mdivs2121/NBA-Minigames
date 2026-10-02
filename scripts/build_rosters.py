"""
build_rosters.py - every team's full roster, for the Full Roster tab of Name
the Team.

Writes one small file per season from 1984-85 on, so the game only downloads
the season it needs:

  data/rosters/2008.json   (2007-08)
    [ { team: "BOS", name: "Boston Celtics", record: "66-16",
        players: [ [id, pos, ppg, rpg, apg], ... ] }, ... ]

  data/rosters/index.json  [ "1984-85", ..., "2025-26" ]

Players are everyone who played a game for that team that season, most
minutes first. Names come from data/player/index.json.

Run:  python3 build_rosters.py
"""
import json
import re

import pandas as pd

from paths import OUT_DIR, STATS_DIR

SINCE = 1985
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")


def main():
    per_game = pd.read_csv(STATS_DIR / "Player Per Game.csv")
    rows = per_game[(per_game["lg"] == "NBA") & (per_game["season"] >= SINCE) & ~per_game["team"].str.match(SUMMARY_TEAM).fillna(False)].copy()
    rows["minutes"] = rows["g"] * rows["mp_per_game"].fillna(0)
    teams = pd.read_csv(STATS_DIR / "Team Summaries.csv")
    teams = teams[(teams["lg"] == "NBA") & (teams["season"] >= SINCE) & (teams["team"] != "League Average")]

    folder = OUT_DIR / "rosters"
    folder.mkdir(exist_ok=True)
    seasons, total, size = [], 0, 0
    for season, group in teams.groupby("season"):
        out = []
        for _, t in group.sort_values("abbreviation").iterrows():
            roster = rows[(rows["season"] == season) & (rows["team"] == t["abbreviation"])].sort_values("minutes", ascending=False)
            if roster.empty:
                continue
            out.append({
                "team": t["abbreviation"], "name": t["team"], "record": f"{int(t['w'])}-{int(t['l'])}",
                "players": [[p["player_id"], p["pos"] if isinstance(p["pos"], str) else "", round(float(p["pts_per_game"]), 1),
                             round(float(p["trb_per_game"]), 1), round(float(p["ast_per_game"]), 1)] for _, p in roster.iterrows()],
            })
        path = folder / f"{season}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
        seasons.append(f"{season - 1}-{str(season)[-2:]}")
        total += len(out)
        size += path.stat().st_size
    with open(folder / "index.json", "w", encoding="utf-8") as f:
        json.dump(seasons, f)
    print(f"wrote {folder}/: {len(seasons)} seasons, {total} team-seasons, about {size / len(seasons) / 1024:.0f} KB per season")


if __name__ == "__main__":
    main()
