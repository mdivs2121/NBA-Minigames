"""
build_blind_resume.py - anonymous career lines for the Blind Résumé game.

Reads the Kaggle CSVs and writes data/blind_resume.json: one entry per
career a regular fan would know: 300+ games, played from 1979-80 on, an
All-Star pick or a 17+ PPG season, and enough career Win Shares for his era.
Older careers need more, since fewer fans saw them (see ERA_WIN_SHARES).

  [ { id, name, pos, last, seasons, g, ppg, rpg, apg, spg, bpg, tsPct,
      allStar, allNba, mvp, ws }, ... ]

pos is the position he played most (PG, SG, SF, PF, C); the site only pairs
players at the same position or one step apart. last is his final season.

The site hides the name, shows the rest, and asks which of two careers was
worth more career Win Shares.

Run:  python3 build_blind_resume.py
"""
import json
import re

import pandas as pd

from paths import OUT_DIR, STATS_DIR

FIRST_SEASON = 1980
MIN_GAMES = 300
PEAK_PPG = 17
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")
POSITIONS = ["PG", "SG", "SF", "PF", "C"]

# Career Win Shares needed, by the year of a player's last season.
ERA_WIN_SHARES = [(1990, 90), (2000, 70), (2010, 50), (9999, 30)]   # before 1990: 90, 1990s: 70, ...


def era_threshold(last_season):
    return next(ws for before, ws in ERA_WIN_SHARES if last_season < before)


def one_row_per_season(df):
    df = df[df["lg"] == "NBA"].copy()
    df["_summary"] = df["team"].str.match(SUMMARY_TEAM).fillna(False)
    return df.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"])


def main():
    totals = one_row_per_season(pd.read_csv(STATS_DIR / "Player Totals.csv"))
    per_game = one_row_per_season(pd.read_csv(STATS_DIR / "Player Per Game.csv"))
    advanced = one_row_per_season(pd.read_csv(STATS_DIR / "Advanced.csv"))
    all_stars = pd.read_csv(STATS_DIR / "All-Star Selections.csv")
    all_stars = all_stars[all_stars["lg"] == "NBA"].groupby("player_id").size()
    teams = pd.read_csv(STATS_DIR / "End of Season Teams.csv")
    all_nba = teams[(teams["lg"] == "NBA") & (teams["type"] == "All-NBA")].groupby("player_id").size()
    awards = pd.read_csv(STATS_DIR / "Player Award Shares.csv")
    mvps = awards[awards["winner"] & (awards["award"] == "nba mvp")].groupby("player_id").size()

    recent = set(per_game.loc[per_game["season"] >= FIRST_SEASON, "player_id"])
    peak = per_game[per_game["g"] >= 40].groupby("player_id")["pts_per_game"].max()
    c = totals.groupby("player_id")[["g", "pts", "trb", "ast", "stl", "blk", "fga", "fta"]].sum(min_count=1)
    seasons = totals.groupby("player_id")["season"].nunique()
    ws = advanced.groupby("player_id")["ws"].sum()
    names = totals.drop_duplicates("player_id", keep="last").set_index("player_id")["player"]
    positions = per_game[per_game["pos"].isin(POSITIONS)].groupby("player_id")["pos"].agg(lambda s: s.value_counts().index[0])
    last_season = per_game.groupby("player_id")["season"].max()

    out = []
    for pid, row in c.iterrows():
        if pid not in recent or row["g"] < MIN_GAMES:
            continue
        if all_stars.get(pid, 0) == 0 and peak.get(pid, 0) < PEAK_PPG:
            continue
        if pid not in positions.index or ws.get(pid, 0) < era_threshold(int(last_season[pid])):
            continue
        g = row["g"]
        per = lambda col: None if pd.isna(row[col]) else round(float(row[col]) / g, 1)
        ts_attempts = 2 * (row["fga"] + 0.44 * row["fta"])
        out.append({
            "id": pid, "name": names[pid], "pos": positions[pid], "last": int(last_season[pid]),
            "seasons": int(seasons[pid]), "g": int(g),
            "ppg": per("pts"), "rpg": per("trb"), "apg": per("ast"), "spg": per("stl"), "bpg": per("blk"),
            "tsPct": round(float(row["pts"]) / ts_attempts, 3) if ts_attempts else None,
            "allStar": int(all_stars.get(pid, 0)), "allNba": int(all_nba.get(pid, 0)), "mvp": int(mvps.get(pid, 0)),
            "ws": round(float(ws.get(pid, 0)), 1),
        })

    out.sort(key=lambda p: p["id"])
    path = OUT_DIR / "blind_resume.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(out)} careers, "
          f"by position {pd.Series([p['pos'] for p in out]).value_counts().to_dict()}")
    for pid in ("jamesle01", "millspa01"):
        print("  ", next((p for p in out if p["id"] == pid), None))


if __name__ == "__main__":
    main()
