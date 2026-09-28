"""
build_snake_data.py - player-seasons for the Snake Draft game.

Reads Advanced.csv and Player Per Game.csv from the Kaggle dataset
"NBA Stats (1947-present)" and writes data/snake.json: a list of
single seasons, e.g. 2015-16 Stephen Curry:

  [ { id, name, season, teams, pos, slot, g, ppg, rpg, apg, tsPct, ws }, ... ]

slot is the lineup spot the season fills: G (PG/SG), F (SF/PF), or C.
ws (Win Shares) is how the game scores a team, so the site keeps it hidden
until the draft is over.

Run:  python3 build_snake_data.py
"""
import json
import re
from pathlib import Path

import pandas as pd
from paths import OUT_DIR, STATS_DIR


FIRST_SEASON = 1980          # 1979-80, the first season with the 3-point line
MIN_GAMES = 50
GOOD_WS = 6.0                # a strong season
TRAP_PPG, TRAP_WS = 20, 4    # big scoring, little winning: fun to avoid
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")
SLOTS = {"PG": "G", "SG": "G", "SF": "F", "PF": "F", "C": "C"}


def season_label(end_year: int) -> str:
    return f"{end_year - 1}-{str(end_year)[-2:]}"


def one_row_per_season(df: pd.DataFrame) -> pd.DataFrame:
    """Traded players have a row per team plus a total row; keep just the total."""
    df = df[(df["lg"] == "NBA") & (df["season"] >= FIRST_SEASON)].copy()
    df["_summary"] = df["team"].str.match(SUMMARY_TEAM).fillna(False)
    return df.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"])


def main():
    per_game_all = pd.read_csv(STATS_DIR / "Player Per Game.csv")
    per_game = one_row_per_season(per_game_all)
    advanced = one_row_per_season(pd.read_csv(STATS_DIR / "Advanced.csv"))

    # Every team a player suited up for that season, in the order listed.
    team_rows = per_game_all[(per_game_all["lg"] == "NBA") & (per_game_all["season"] >= FIRST_SEASON)]
    team_rows = team_rows[~team_rows["team"].str.match(SUMMARY_TEAM).fillna(False)]
    teams = team_rows.groupby(["player_id", "season"])["team"].apply(list)

    df = per_game.merge(advanced[["player_id", "season", "ws", "ts_percent"]], on=["player_id", "season"])
    df = df[df["g"] >= MIN_GAMES]
    df = df[(df["ws"] >= GOOD_WS) | ((df["pts_per_game"] >= TRAP_PPG) & (df["ws"] < TRAP_WS))]
    df = df[df["pos"].isin(SLOTS)]

    out = []
    for r in df.sort_values(["season", "player"]).itertuples():
        out.append({
            "id": r.player_id,
            "name": r.player,
            "season": season_label(r.season),
            "teams": teams.get((r.player_id, r.season), [r.team]),
            "pos": r.pos,
            "slot": SLOTS[r.pos],
            "g": int(r.g),
            "ppg": round(float(r.pts_per_game), 1),
            "rpg": round(float(r.trb_per_game), 1),
            "apg": round(float(r.ast_per_game), 1),
            "tsPct": None if pd.isna(r.ts_percent) else round(float(r.ts_percent), 3),
            "ws": round(float(r.ws), 1),
        })

    path = OUT_DIR / "snake.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    traps = sum(1 for s in out if s["ws"] < TRAP_WS)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(out)} seasons, "
          f"{len({s['id'] for s in out})} players, {traps} traps")
    by_slot = {k: sum(1 for s in out if s["slot"] == k) for k in "GFC"}
    print("by slot:", by_slot)
    curry = next((s for s in out if s["id"] == "curryst01" and s["season"] == "2015-16"), None)
    print("Curry 2015-16:", curry)


if __name__ == "__main__":
    main()
