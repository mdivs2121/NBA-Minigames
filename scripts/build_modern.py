"""
build_modern.py - who counts as a "modern" player, for every game's Modern tab.

Writes data/modern.json:

  { "draftSince": 2003, "seasonSince": 2010, "ids": [player id, ...] }

A modern player was drafted in 2003 or later (LeBron's class), or went
undrafted and played his first NBA season in 2003-04 or later. Games built on
single seasons also keep only seasons from 2009-10 on (seasonSince), when
those players were in their primes.

Run:  python3 build_modern.py
"""
import json

import pandas as pd

from paths import OUT_DIR, STATS_DIR

DRAFT_SINCE, SEASON_SINCE = 2003, 2010


def main():
    draft = pd.read_csv(STATS_DIR / "Draft Pick History.csv")
    draft = draft[draft["lg"] == "NBA"].dropna(subset=["player_id"])
    first_draft = draft.groupby("player_id")["season"].min()
    pg = pd.read_csv(STATS_DIR / "Player Per Game.csv")
    debut = pg[pg["lg"] == "NBA"].groupby("player_id")["season"].min()

    ids = sorted(
        pid for pid, first in debut.items()
        if (first_draft.get(pid, 0) >= DRAFT_SINCE) or (pid not in first_draft.index and first >= DRAFT_SINCE + 1)
    )
    path = OUT_DIR / "modern.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"draftSince": DRAFT_SINCE, "seasonSince": SEASON_SINCE, "ids": ids}, f, separators=(",", ":"))
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(ids)} modern players")
    for pid in ["jamesle01", "wadedw01", "curryst01", "duncati01", "bryanko01", "nashst01"]:
        print(f"  {pid}: {pid in ids}")


if __name__ == "__main__":
    main()
