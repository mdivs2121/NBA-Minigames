"""
build_stat_lines.py - single seasons for the Stat Line game.

Writes data/stat_lines.json:

  { "lines": [ [id, season, team, age, pos, g, mpg, ppg, rpg, apg, spg, bpg, fg, three, ft, easy], ... ] }

season is the year it ended (2016 = 2015-16). Percentages are whole numbers
(three is null with fewer than 50 attempts). easy is 1 for the Easy pool.

  Easy  1995-96 on, 18+ PPG, by an All-Star
  Hard  1985-86 on, 25+ MPG (Easy seasons included)

Both need 50+ games, all with one team (traded seasons are skipped, so the
team clue is never a "2TM").

Run:  python3 build_stat_lines.py
"""
import json
import re

import pandas as pd

from paths import OUT_DIR, STATS_DIR

SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")
MIN_GAMES = 50
EASY_SINCE, EASY_PPG = 1996, 18
HARD_SINCE, HARD_MPG = 1986, 25


def pct(made_pct, attempts=None, min_attempts=0):
    if pd.isna(made_pct) or (attempts is not None and attempts < min_attempts):
        return None
    return round(float(made_pct) * 100)


def main():
    pg = pd.read_csv(STATS_DIR / "Player Per Game.csv")
    pg = pg[(pg["lg"] == "NBA") & (pg["season"] >= HARD_SINCE)]
    # Skip traded seasons: keep player-seasons with exactly one row.
    rows_per = pg.groupby(["player_id", "season"]).size()
    single = rows_per[rows_per == 1].index
    pg = pg.set_index(["player_id", "season"]).loc[lambda d: d.index.isin(single)].reset_index()
    pg = pg[~pg["team"].str.match(SUMMARY_TEAM).fillna(False) & (pg["g"] >= MIN_GAMES) & (pg["mp_per_game"] >= HARD_MPG)]

    stars = pd.read_csv(STATS_DIR / "All-Star Selections.csv")
    all_stars = set(stars.loc[stars["lg"] == "NBA", "player_id"])
    index = json.load(open(OUT_DIR / "player" / "index.json", encoding="utf-8"))

    lines = []
    for _, r in pg.iterrows():
        if r["player_id"] not in index:
            continue
        easy = r["season"] >= EASY_SINCE and r["pts_per_game"] >= EASY_PPG and r["player_id"] in all_stars
        lines.append([
            r["player_id"], int(r["season"]), r["team"], int(r["age"]), (r["pos"] or "").split("-")[0],
            int(r["g"]), round(float(r["mp_per_game"]), 1), round(float(r["pts_per_game"]), 1),
            round(float(r["trb_per_game"]), 1), round(float(r["ast_per_game"]), 1),
            round(float(r["stl_per_game"]), 1), round(float(r["blk_per_game"]), 1),
            pct(r["fg_percent"]), pct(r["x3p_percent"], r["x3pa_per_game"] * r["g"], 50), pct(r["ft_percent"]),
            int(easy),
        ])
    lines.sort(key=lambda l: (l[1], l[0]))
    path = OUT_DIR / "stat_lines.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"lines": lines}, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(lines)} seasons, {sum(l[-1] for l in lines)} easy")
    print("  e.g.", next(l for l in lines if l[0] == "jamesle01"))


if __name__ == "__main__":
    main()
