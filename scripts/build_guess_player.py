"""
build_guess_player.py - players and clues for the Guess the Player daily.

Reads the Kaggle CSVs plus data/connections.json (for fame scores) and writes
data/guess_player.json:

  { "players": [ { id, name, team, pos, ht, debut, pick, allStars, answer }, ... ] }

Everyone who played from 2000-01 on with 150+ games can be guessed. About 250
of the best-known (still playing in 2008 or later) can be the answer.
  team      his most recent team (abbreviation)
  pos       G, F, C, or a combo like G-F
  ht        height in inches
  debut     the year his first season ended (2004 = 2003-04)
  pick      overall draft pick, or null if undrafted
  allStars  All-Star selections

Run after build_connections_data.py:  python3 build_guess_player.py
"""
import json
import re

import pandas as pd

from paths import OUT_DIR, STATS_DIR

SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")
GUESSABLE_SINCE, MIN_GAMES = 2001, 150
ANSWERS, ANSWERS_SINCE = 250, 2008
SAME_TEAM = {"NOK": "NOH"}   # the Katrina-era Hornets


def main():
    fame = json.load(open(OUT_DIR / "connections.json", encoding="utf-8"))["fame"]
    per_game = pd.read_csv(STATS_DIR / "Player Per Game.csv").reset_index()
    per_game = per_game[per_game["lg"] == "NBA"]
    team_rows = per_game[~per_game["team"].str.match(SUMMARY_TEAM).fillna(False)].sort_values(["season", "index"])
    last_team = team_rows.groupby("player_id")["team"].last().replace(SAME_TEAM)
    seasons = per_game.groupby("player_id")["season"].agg(["min", "max"])
    totals = pd.read_csv(STATS_DIR / "Player Totals.csv")
    totals = totals[totals["lg"] == "NBA"].copy()
    totals["_summary"] = totals["team"].str.match(SUMMARY_TEAM).fillna(False)
    games = totals.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"]).groupby("player_id")["g"].sum()
    info = pd.read_csv(STATS_DIR / "Player Career Info.csv").set_index("player_id")
    draft = pd.read_csv(STATS_DIR / "Draft Pick History.csv")
    draft = draft[draft["lg"] == "NBA"].drop_duplicates("player_id").set_index("player_id")["overall_pick"]
    all_stars = pd.read_csv(STATS_DIR / "All-Star Selections.csv")
    star_count = all_stars[all_stars["lg"] == "NBA"].groupby("player_id").size()

    out = []
    for pid, (first, last) in seasons.iterrows():
        if last < GUESSABLE_SINCE or games.get(pid, 0) < MIN_GAMES or pid not in info.index:
            continue
        i = info.loc[pid]
        if pd.isna(i["ht_in_in"]) or pd.isna(i["pos"]):
            continue
        out.append({
            "id": pid, "name": i["player"], "team": last_team[pid], "pos": i["pos"],
            "ht": int(i["ht_in_in"]), "debut": int(first), "last": int(last),
            "pick": int(draft[pid]) if pid in draft.index else None,
            "allStars": int(star_count.get(pid, 0)),
        })

    # The answer pool: the best-known players still playing in 2008 or later.
    candidates = sorted((p for p in out if p["last"] >= ANSWERS_SINCE and p["id"] in fame),
                        key=lambda p: (-fame[p["id"]], p["id"]))[:ANSWERS]
    answer_ids = {p["id"] for p in candidates}
    for p in out:
        p["answer"] = p["id"] in answer_ids
        del p["last"]
    out.sort(key=lambda p: p["id"])

    path = OUT_DIR / "guess_player.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"players": out}, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(out)} guessable, {len(answer_ids)} possible answers")
    print("  least famous answers:", ", ".join(p["name"] for p in candidates[-6:]))
    print("  LeBron:", next(p for p in out if p["id"] == "jamesle01"))


if __name__ == "__main__":
    main()
