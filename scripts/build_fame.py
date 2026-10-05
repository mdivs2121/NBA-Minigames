"""
build_fame.py - how well-known each player is, for sorting the player picker.

Writes data/fame.json: { player id: career Win Shares, rounded } for every NBA
player with at least 1 Win Share. The "Start typing a player…" dropdown loads
it the first time you type, so stars come before deep cuts with the same name.

Run:  python3 build_fame.py
"""
import json
import re

import pandas as pd

from paths import OUT_DIR, STATS_DIR

SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")


def main():
    adv = pd.read_csv(STATS_DIR / "Advanced.csv")
    adv = adv[adv["lg"] == "NBA"].copy()
    adv["_summary"] = adv["team"].str.match(SUMMARY_TEAM).fillna(False)
    ws = adv.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"]).groupby("player_id")["ws"].sum()
    fame = {pid: int(round(v)) for pid, v in ws.items() if v >= 1}
    path = OUT_DIR / "fame.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(fame, f, separators=(",", ":"), sort_keys=True)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(fame)} players")


if __name__ == "__main__":
    main()
