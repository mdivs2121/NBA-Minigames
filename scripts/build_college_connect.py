"""
build_college_connect.py - colleges and franchises for the College Connect game.

Writes data/college_connect.json:

  { "colleges": [name, ...], "teams": [abbr, ...],
    "players": [ [id, name, fame, [college index, ...], [team index, ...]], ... ] }

Everyone who played an NBA season from 1979-80 on and went to one of the
colleges that sent 10+ of them. Teams are franchises (relocated teams count
as one, like the Awards Grid). fame is career Win Shares, used to pick fair
pairs and to rank the answers.

Run:  python3 build_college_connect.py
"""
import json
import re

import pandas as pd

from build_awards_grid import FRANCHISE, TEAM_NAMES
from paths import OUT_DIR, STATS_DIR

SINCE, MIN_PLAYERS = 1980, 10
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")


def main():
    pg = pd.read_csv(STATS_DIR / "Player Per Game.csv")
    pg = pg[pg["lg"] == "NBA"]
    recent = set(pg.loc[pg["season"] >= SINCE, "player_id"])
    rows = pg[pg["player_id"].isin(recent) & ~pg["team"].str.match(SUMMARY_TEAM).fillna(False)]
    franchises = rows.assign(f=rows["team"].replace(FRANCHISE)).groupby("player_id")["f"].agg(lambda s: sorted(set(s) & set(TEAM_NAMES)))

    adv = pd.read_csv(STATS_DIR / "Advanced.csv")
    adv = adv[(adv["lg"] == "NBA") & adv["player_id"].isin(recent)].copy()
    adv["_summary"] = adv["team"].str.match(SUMMARY_TEAM).fillna(False)
    fame = adv.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"]).groupby("player_id")["ws"].sum()

    info = pd.read_csv(STATS_DIR / "Player Career Info.csv").set_index("player_id")
    info = info[info.index.isin(recent)]
    lists = info["colleges"].fillna("").map(lambda s: [c.strip() for c in s.split(",") if c.strip()])
    counts = lists.explode().dropna().value_counts()
    colleges = sorted(counts[counts >= MIN_PLAYERS].index)
    college_index = {c: i for i, c in enumerate(colleges)}
    teams = sorted(TEAM_NAMES)
    team_index = {t: i for i, t in enumerate(teams)}

    players = []
    for pid, cs in lists.items():
        mine = sorted({college_index[c] for c in cs if c in college_index})
        if not mine or pid not in franchises.index:
            continue
        players.append([pid, info.at[pid, "player"], round(float(fame.get(pid, 0)), 1), mine, [team_index[t] for t in franchises[pid]]])
    players.sort(key=lambda p: p[0])

    path = OUT_DIR / "college_connect.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"colleges": colleges, "teams": teams, "players": players}, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(colleges)} colleges, {len(players)} players")
    print("  biggest:", ", ".join(f"{c} {n}" for c, n in counts.head(8).items()))


if __name__ == "__main__":
    main()
