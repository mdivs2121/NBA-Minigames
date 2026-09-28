"""
build_mvp_data.py - MVP races for the MVP Ballot game.

Reads Player Award Shares.csv, Player Per Game.csv, Advanced.csv, and
Team Summaries.csv from the Kaggle dataset "NBA Stats (1947-present)" and
writes data/mvp.json:

  { "2015-16": [ { id, name, age, teams, record, first, points, share,
                   g, ppg, rpg, apg, ws, tsPct }, ... top 5 by voting points ] }

Run:  python3 build_mvp_data.py
"""
import json
import re
from pathlib import Path

import pandas as pd
from paths import OUT_DIR, STATS_DIR


FIRST_SEASON = 1980
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")


def season_label(end_year: int) -> str:
    return f"{end_year - 1}-{str(end_year)[-2:]}"


def one_row_per_season(df: pd.DataFrame) -> pd.DataFrame:
    df = df[df["lg"] == "NBA"].copy()
    df["_summary"] = df["team"].str.match(SUMMARY_TEAM).fillna(False)
    return df.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"])


def main():
    votes = pd.read_csv(STATS_DIR / "Player Award Shares.csv")
    votes = votes[(votes["award"] == "nba mvp") & (votes["season"] >= FIRST_SEASON)]

    per_game_all = pd.read_csv(STATS_DIR / "Player Per Game.csv")
    per_game = one_row_per_season(per_game_all).set_index(["player_id", "season"])
    advanced = one_row_per_season(pd.read_csv(STATS_DIR / "Advanced.csv")).set_index(["player_id", "season"])
    team_rows = per_game_all[(per_game_all["lg"] == "NBA") & ~per_game_all["team"].str.match(SUMMARY_TEAM).fillna(False)]
    teams = team_rows.groupby(["player_id", "season"])["team"].apply(list)

    summaries = pd.read_csv(STATS_DIR / "Team Summaries.csv")
    summaries = summaries[summaries["lg"] == "NBA"]
    records = {(r.abbreviation, r.season): f"{int(r.w)}-{int(r.l)}" for r in summaries.itertuples() if not pd.isna(r.w)}

    out = {}
    for season, group in votes.groupby("season"):
        top = group.sort_values("pts_won", ascending=False).head(5)
        race = []
        for r in top.itertuples():
            key = (r.player_id, season)
            pg, adv = per_game.loc[key], advanced.loc[key]
            played_for = teams.get(key, [pg["team"]])
            race.append({
                "id": r.player_id,
                "name": r.player,
                "age": int(r.age),
                "teams": played_for,
                "record": records.get((played_for[-1], season)),   # the team he finished the season with
                "first": int(r.first),
                "points": int(r.pts_won),
                "share": round(float(r.share), 3),
                "g": int(pg["g"]),
                "ppg": round(float(pg["pts_per_game"]), 1),
                "rpg": round(float(pg["trb_per_game"]), 1),
                "apg": round(float(pg["ast_per_game"]), 1),
                "ws": round(float(adv["ws"]), 1),
                "tsPct": None if pd.isna(adv["ts_percent"]) else round(float(adv["ts_percent"]), 3),
            })
        out[season_label(season)] = race

    path = OUT_DIR / "mvp.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(out)} seasons, {min(out)} to {max(out)}")
    print("2015-16:", [(p["name"], p["points"], p["record"]) for p in out["2015-16"]])
    ties = [s for s, race in out.items() if len({p["points"] for p in race}) < 5]
    print("seasons with a tie in the top 5:", ties)


if __name__ == "__main__":
    main()
