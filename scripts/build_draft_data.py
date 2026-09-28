"""
build_draft_data.py - draft classes for the Draft Redo game.

Reads Draft Pick History.csv, Advanced.csv, and Player Totals.csv from the
Kaggle dataset "NBA Stats (1947-present)" and writes data/draft.json:

  { "2003": [ { pick, round, team, id, name, college,
                ws, g, ppg, rpg, apg, seasons }, ... ] }

ws is career regular-season Win Shares (NBA only), the measure the game
scores against. Players who never played in the NBA have 0 for everything.

Run:  python3 build_draft_data.py
"""
import json
import re
from pathlib import Path

import pandas as pd
from paths import OUT_DIR, STATS_DIR


# 1989 is the first two-round draft; later classes are too young to judge.
FIRST_CLASS, LAST_CLASS = 1989, 2021
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")


def one_row_per_season(df: pd.DataFrame) -> pd.DataFrame:
    """Traded players have a row per team plus a total row; keep just the total."""
    df = df[df["lg"] == "NBA"].copy()
    df["_summary"] = df["team"].str.match(SUMMARY_TEAM).fillna(False)
    return df.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"])


def main():
    draft = pd.read_csv(STATS_DIR / "Draft Pick History.csv")
    draft = draft[(draft["lg"] == "NBA") & draft["season"].between(FIRST_CLASS, LAST_CLASS)]

    advanced = one_row_per_season(pd.read_csv(STATS_DIR / "Advanced.csv"))
    ws = advanced.groupby("player_id")["ws"].sum()

    totals = one_row_per_season(pd.read_csv(STATS_DIR / "Player Totals.csv"))
    career = totals.groupby("player_id")[["g", "pts", "trb", "ast"]].sum()
    seasons = totals.groupby("player_id")["season"].nunique()

    out = {}
    for row in draft.sort_values(["season", "overall_pick"]).itertuples():
        pid = row.player_id
        g = int(career.at[pid, "g"]) if pid in career.index else 0
        per_game = lambda col: round(career.at[pid, col] / g, 1) if g else 0.0
        out.setdefault(str(row.season), []).append({
            "pick": int(row.overall_pick),
            "round": int(row.round),
            "team": row.tm,
            "id": pid,
            "name": row.player,
            "college": None if pd.isna(row.college) else row.college,
            "ws": round(float(ws.get(pid, 0.0)), 1),
            "g": g,
            "ppg": per_game("pts"),
            "rpg": per_game("trb"),
            "apg": per_game("ast"),
            "seasons": int(seasons.get(pid, 0)),
        })

    path = OUT_DIR / "draft.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB), classes {FIRST_CLASS}-{LAST_CLASS}")

    # Sanity check: the best players from the 2003 class by career Win Shares.
    top = sorted(out["2003"], key=lambda p: -p["ws"])[:5]
    print("2003 by Win Shares:", ", ".join(f"{p['name']} (#{p['pick']}, {p['ws']})" for p in top))


if __name__ == "__main__":
    main()
