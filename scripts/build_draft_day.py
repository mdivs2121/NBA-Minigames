"""
build_draft_day.py - first-round picks for the Draft Day game.

Writes data/draft_day.json:

  { "picks": [ [id, year, pick, team, college, pos, games, easy], ... ] }

year is the draft year (2003 = the June 2003 draft). college is "" for
players who skipped it. easy is 1 for the Easy pool: lottery picks (1-14)
from 1995 on who played 300+ games. Hard is every first-round pick from 1985
on who played at least one NBA game.

Run after build_player_pages.py:  python3 build_draft_day.py
"""
import json
import re

import pandas as pd

from paths import OUT_DIR, STATS_DIR

SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")
SINCE, EASY_SINCE, EASY_PICKS, EASY_GAMES = 1985, 1995, 14, 300


def main():
    draft = pd.read_csv(STATS_DIR / "Draft Pick History.csv")
    draft = draft[(draft["lg"] == "NBA") & (draft["season"] >= SINCE) & (draft["round"] == 1)].dropna(subset=["player_id"])
    totals = pd.read_csv(STATS_DIR / "Player Totals.csv")
    totals = totals[totals["lg"] == "NBA"].copy()
    totals["_summary"] = totals["team"].str.match(SUMMARY_TEAM).fillna(False)
    games = totals.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"]).groupby("player_id")["g"].sum()
    info = pd.read_csv(STATS_DIR / "Player Career Info.csv").set_index("player_id")
    index = json.load(open(OUT_DIR / "player" / "index.json", encoding="utf-8"))

    picks = []
    for _, d in draft.iterrows():
        pid = d["player_id"]
        if pid not in index or games.get(pid, 0) < 1:
            continue
        college = "" if pd.isna(d["college"]) else str(d["college"])
        pos = info.at[pid, "pos"] if pid in info.index and isinstance(info.at[pid, "pos"], str) else ""
        g = int(games[pid])
        easy = d["season"] >= EASY_SINCE and d["overall_pick"] <= EASY_PICKS and g >= EASY_GAMES
        picks.append([pid, int(d["season"]), int(d["overall_pick"]), d["tm"], college, pos, g, int(easy)])
    picks.sort(key=lambda p: (p[1], p[2]))
    path = OUT_DIR / "draft_day.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"picks": picks}, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(picks)} picks, {sum(p[-1] for p in picks)} easy")
    print("  e.g.", next(p for p in picks if p[0] == "jamesle01"))


if __name__ == "__main__":
    main()
