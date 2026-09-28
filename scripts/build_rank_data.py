"""
build_rank_data.py - stats for the Rank the Five daily puzzle.

Reads Player Totals.csv and Player Per Game.csv from the Kaggle dataset
"NBA Stats (1947-present)" and writes data/rank_stats.json:

  { playerId: {
      "career":  { g, pts, trb, ast, stl, blk, x3p, trpDbl, seasons },
      "seasons": { "2016-17": { teams, g, mpg, ppg, rpg, apg, spg, bpg,
                                fgPct, fga, threePct, threePa, ftPct, fta } }
  } }

Only players in data/players.json (NBA, 2005-06 onward) are included, but
their career totals count every NBA season they played, even before 2005.

Run after build_data.py:  python3 build_rank_data.py
"""
import json
import re
from pathlib import Path

import pandas as pd
from paths import OUT_DIR, STATS_DIR


FIRST_SEASON = 2006  # seasons are labeled by the year they end: 2006 = 2005-06
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")

CAREER_COLUMNS = {"g": "g", "pts": "pts", "trb": "trb", "ast": "ast",
                  "stl": "stl", "blk": "blk", "x3p": "x3p", "trp_dbl": "trpDbl"}

SEASON_COLUMNS = {
    "g": "g",
    "mp_per_game": "mpg",
    "pts_per_game": "ppg",
    "trb_per_game": "rpg",
    "ast_per_game": "apg",
    "stl_per_game": "spg",
    "blk_per_game": "bpg",
    "fg_percent": "fgPct",
    "fga_per_game": "fga",
    "x3p_percent": "threePct",
    "x3pa_per_game": "threePa",
    "ft_percent": "ftPct",
    "fta_per_game": "fta",
}


def season_label(end_year: int) -> str:
    return f"{end_year - 1}-{str(end_year)[-2:]}"


def one_row_per_season(df: pd.DataFrame) -> pd.DataFrame:
    """Traded players have a row per team plus a total row; keep just the total."""
    df = df.copy()
    df["_summary"] = df["team"].str.match(SUMMARY_TEAM).fillna(False)
    df = df.sort_values("_summary", ascending=False)
    return df.drop_duplicates(["player_id", "season"])


def clean(value, digits=3):
    return None if pd.isna(value) else round(float(value), digits)


def main():
    players = json.load(open(OUT_DIR / "players.json", encoding="utf-8"))
    ids = set(players)

    totals = pd.read_csv(STATS_DIR / "Player Totals.csv")
    totals = one_row_per_season(totals[(totals["lg"] == "NBA") & totals["player_id"].isin(ids)])

    per_game = pd.read_csv(STATS_DIR / "Player Per Game.csv")
    per_game = per_game[(per_game["lg"] == "NBA") & per_game["player_id"].isin(ids)
                        & (per_game["season"] >= FIRST_SEASON)]
    is_summary = per_game["team"].str.match(SUMMARY_TEAM).fillna(False)
    teams = per_game[~is_summary].groupby(["player_id", "season"])["team"].apply(list)
    per_game = one_row_per_season(per_game)

    out = {pid: {"career": {}, "seasons": {}} for pid in ids}

    career = totals.groupby("player_id")[list(CAREER_COLUMNS)].sum(min_count=1)
    seasons_played = totals.groupby("player_id")["season"].nunique()
    for pid, row in career.iterrows():
        c = {dst: None if pd.isna(row[src]) else int(row[src]) for src, dst in CAREER_COLUMNS.items()}
        c["seasons"] = int(seasons_played[pid])
        out[pid]["career"] = c

    for row in per_game.to_dict("records"):
        stats = {dst: clean(row[src]) for src, dst in SEASON_COLUMNS.items()}
        stats["g"] = None if stats["g"] is None else int(stats["g"])
        stats["teams"] = teams.get((row["player_id"], row["season"]), [])
        out[row["player_id"]]["seasons"][season_label(row["season"])] = stats

    path = OUT_DIR / "rank_stats.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB)")

    # Sanity check - compare against Basketball-Reference if these look off.
    lebron = out.get("jamesle01", {}).get("career", {})
    print(f"LeBron career: {lebron.get('pts')} pts, {lebron.get('ast')} ast, "
          f"{lebron.get('trpDbl')} triple-doubles, {lebron.get('seasons')} seasons")
    print(f"Curry 2015-16: {out.get('curryst01', {}).get('seasons', {}).get('2015-16')}")


if __name__ == "__main__":
    main()
