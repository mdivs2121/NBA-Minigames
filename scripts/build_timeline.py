"""
build_timeline.py - events for the Timeline game.

Writes data/timeline.json:

  { "events": [ [text, year, when, player id or "", team or "", player name or ""], ... ] }

  year  the calendar year it happened (awards and titles land in the spring a
        season ends, the draft in June), used to put events in order
  when  how the year is shown after you lock in, like "2010-11 season"

Events from 1979-80 on: MVP, DPOY, Rookie of the Year, Sixth Man, and Most
Improved winners, #1 draft picks, champions, and first All-Star picks for
players who made three or more.

Run after build_awards_grid.py:  python3 build_timeline.py
"""
import json

import pandas as pd

from build_awards_grid import CHAMPIONS, award_winners
from paths import OUT_DIR, STATS_DIR

SINCE = 1980
AWARDS = {"nba mvp": "wins MVP", "nba dpoy": "wins Defensive Player of the Year", "nba roy": "wins Rookie of the Year",
          "nba smoy": "wins Sixth Man of the Year", "nba mip": "wins Most Improved Player"}


def season_text(season):
    return f"{season - 1}-{str(season)[-2:]} season"


def main():
    events = []

    awards = award_winners()
    awards = awards[awards["award"].isin(AWARDS) & (awards["season"] >= SINCE)]
    for _, a in awards.iterrows():
        events.append([f"{a['player']} {AWARDS[a['award']]}", int(a["season"]), season_text(a["season"]), a["player_id"], "", a["player"]])

    draft = pd.read_csv(STATS_DIR / "Draft Pick History.csv")
    firsts = draft[(draft["lg"] == "NBA") & (draft["overall_pick"] == 1) & (draft["season"] >= SINCE)]
    for _, d in firsts.iterrows():
        events.append([f"{d['player']} goes #1 in the draft", int(d["season"]), f"{d['season']} draft", d["player_id"], d["tm"], d["player"]])

    teams = pd.read_csv(STATS_DIR / "Team Summaries.csv")
    names = {(r["season"], r["abbreviation"]): r["team"] for _, r in teams[teams["lg"] == "NBA"].iterrows()}
    for season, abbr in CHAMPIONS.items():
        events.append([f"The {names[(season, abbr)]} win the title", season, f"{season - 1}-{str(season)[-2:]} Finals", "", abbr, ""])

    stars = pd.read_csv(STATS_DIR / "All-Star Selections.csv")
    stars = stars[stars["lg"] == "NBA"]
    counts = stars.groupby("player_id").size()
    first = stars.sort_values("season").drop_duplicates("player_id")
    for _, s in first[(first["season"] >= SINCE) & first["player_id"].map(lambda p: counts[p] >= 3)].iterrows():
        events.append([f"{s['player']} makes his first All-Star team", int(s["season"]), f"{s['season']} All-Star Game", s["player_id"], "", s["player"]])

    assert all(isinstance(e[3], str) for e in events), "an event is missing its player id"
    events.sort(key=lambda e: (e[1], e[0]))
    path = OUT_DIR / "timeline.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"events": events}, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(events)} events, {events[0][1]}–{events[-1][1]}")
    print("  e.g.", events[len(events) // 2])


if __name__ == "__main__":
    main()
