"""
build_blind_draft.py - anonymous player-seasons for the Blind Draft game.

Writes data/blind_draft.json:

  { "seasons": [ [id, season, pos, g, mpg, ppg, rpg, apg, spg, bpg, ts, three, ws], ... ] }

season is the year it ended. ts and three are whole-number percentages (three
is null under 50 attempts). ws is Win Shares, hidden until the draft ends.
From 1989-90 on, 50+ games, 24+ minutes a night, one team all season.

Run:  python3 build_blind_draft.py
"""
import json
import re

import pandas as pd

from paths import OUT_DIR, STATS_DIR

SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")
SINCE, MIN_GAMES, MIN_MPG = 1990, 50, 24
POSITIONS = {"PG", "SG", "SF", "PF", "C"}


def main():
    pg = pd.read_csv(STATS_DIR / "Player Per Game.csv")
    pg = pg[(pg["lg"] == "NBA") & (pg["season"] >= SINCE)]
    rows_per = pg.groupby(["player_id", "season"]).size()
    single = set(rows_per[rows_per == 1].index)
    pg = pg[[k in single for k in zip(pg["player_id"], pg["season"])]]
    pg = pg[(pg["g"] >= MIN_GAMES) & (pg["mp_per_game"] >= MIN_MPG)]
    adv = pd.read_csv(STATS_DIR / "Advanced.csv")
    adv = adv[adv["lg"] == "NBA"].drop_duplicates(["player_id", "season"]).set_index(["player_id", "season"])
    index = json.load(open(OUT_DIR / "player" / "index.json", encoding="utf-8"))

    out = []
    for _, r in pg.iterrows():
        key = (r["player_id"], r["season"])
        pos = str(r["pos"]).split("-")[0]
        if key not in adv.index or pos not in POSITIONS or r["player_id"] not in index:
            continue
        a = adv.loc[key]
        attempts = r["x3pa_per_game"] * r["g"]
        out.append([
            r["player_id"], int(r["season"]), pos, int(r["g"]), round(float(r["mp_per_game"]), 1),
            round(float(r["pts_per_game"]), 1), round(float(r["trb_per_game"]), 1), round(float(r["ast_per_game"]), 1),
            round(float(r["stl_per_game"]), 1), round(float(r["blk_per_game"]), 1),
            round(float(a["ts_percent"]) * 100) if pd.notna(a["ts_percent"]) else None,
            round(float(r["x3p_percent"]) * 100) if attempts >= 50 and pd.notna(r["x3p_percent"]) else None,
            round(float(a["ws"]), 1),
        ])
    path = OUT_DIR / "blind_draft.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"seasons": out}, f, separators=(",", ":"), ensure_ascii=False)
    counts = pd.Series([s[2] for s in out]).value_counts().to_dict()
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(out)} seasons {counts}")


if __name__ == "__main__":
    main()
