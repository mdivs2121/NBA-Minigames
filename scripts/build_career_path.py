"""
build_career_path.py - team histories for the Career Path game.

Reads the Kaggle CSVs plus data/connections.json (for its recognizable-player
pool and fame scores) and writes data/career_path.json:

  { "teams": { "SEA": "Seattle SuperSonics", ... },
    "players": [ { id, name, fame, path: [[team, from, to], ...],
                   pos, ht, draft, ppg, rpg, apg, allStars }, ... ] }

A path is the teams a player suited up for, in order, with the years of each
stint (a season is labeled by the year it ends, so 1997-2016 means 1996-97
through 2015-16). Only players with 2+ stints and a path nobody else shares
are included, so every puzzle has one answer.

Run after build_connections_data.py:  python3 build_career_path.py
"""
import json
import re

import pandas as pd

from paths import OUT_DIR, STATS_DIR

SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")
# NOK was the New Orleans Hornets' temporary home in Oklahoma City after
# Hurricane Katrina (2005-07): the same team, so it's shown as NOH.
SAME_TEAM = {"NOK": "NOH"}


def main():
    cx = json.load(open(OUT_DIR / "connections.json", encoding="utf-8"))
    fame = cx["fame"]
    pool = set(fame)

    per_game = pd.read_csv(STATS_DIR / "Player Per Game.csv").reset_index()   # keep file order within a season
    per_game = per_game[per_game["lg"] == "NBA"]
    team_rows = per_game[~per_game["team"].str.match(SUMMARY_TEAM).fillna(False)]
    team_rows = team_rows[team_rows["player_id"].isin(pool)].sort_values(["season", "index"])
    team_rows = team_rows.assign(team=team_rows["team"].replace(SAME_TEAM))
    totals = pd.read_csv(STATS_DIR / "Player Totals.csv")
    totals = totals[totals["lg"] == "NBA"].copy()
    totals["_summary"] = totals["team"].str.match(SUMMARY_TEAM).fillna(False)
    totals = totals.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"])
    career = totals.groupby("player_id")[["g", "pts", "trb", "ast"]].sum()
    info = pd.read_csv(STATS_DIR / "Player Career Info.csv").set_index("player_id")
    draft = pd.read_csv(STATS_DIR / "Draft Pick History.csv")
    draft = draft[draft["lg"] == "NBA"].drop_duplicates("player_id").set_index("player_id")
    all_stars = pd.read_csv(STATS_DIR / "All-Star Selections.csv")
    star_count = all_stars[all_stars["lg"] == "NBA"].groupby("player_id").size()

    names_by_abbr = pd.read_csv(STATS_DIR / "Team Abbrev.csv")
    names_by_abbr = names_by_abbr[names_by_abbr["lg"] == "NBA"].sort_values("season").groupby("abbreviation")["team"].last()

    # Stints: consecutive seasons with the same team merge into one.
    paths = {}
    for pid, rows in team_rows.groupby("player_id", sort=False):
        path = []
        for r in rows.itertuples():
            if path and path[-1][0] == r.team and r.season - path[-1][2] <= 1:
                path[-1][2] = int(r.season)
            else:
                path.append([r.team, int(r.season), int(r.season)])
        paths[pid] = [[team, start - 1, end] for team, start, end in path]   # 1996-97 starts in 1996

    signature = lambda p: json.dumps(p)
    counts = pd.Series([signature(p) for p in paths.values()]).value_counts()

    out, teams_used = [], set()
    for pid in sorted(paths):
        path = paths[pid]
        if len(path) < 2 or counts[signature(path)] > 1:
            continue
        g = int(career.at[pid, "g"]) if pid in career.index else 0
        per = lambda col: round(float(career.at[pid, col]) / g, 1) if g else None
        d = draft.loc[pid] if pid in draft.index else None
        out.append({
            "id": pid,
            "name": cx["players"].get(pid) or info.at[pid, "player"],
            "fame": fame[pid],
            "path": path,
            "pos": None if pd.isna(info.at[pid, "pos"]) else info.at[pid, "pos"],
            "ht": None if pd.isna(info.at[pid, "ht_in_in"]) else int(info.at[pid, "ht_in_in"]),
            "draft": None if d is None else {"year": int(d["season"]), "pick": int(d["overall_pick"]), "team": d["tm"]},
            "ppg": per("pts"), "rpg": per("trb"), "apg": per("ast"),
            "allStars": int(star_count.get(pid, 0)),
        })
        teams_used |= {t for t, _, _ in path}

    teams = {t: names_by_abbr.get(t, t) for t in sorted(teams_used)}
    path_out = OUT_DIR / "career_path.json"
    with open(path_out, "w", encoding="utf-8") as f:
        json.dump({"teams": teams, "players": out}, f, separators=(",", ":"), ensure_ascii=False)
    stars = sum(1 for p in out if p["fame"] >= 40)
    print(f"wrote {path_out} ({path_out.stat().st_size / 1024:.0f} KB): {len(out)} players "
          f"({stars} well-known), {len(teams)} teams")
    for pid in ("iversal01", "paulch01", "carteevi01"):
        p = next((x for x in out if x["id"] == pid), None)
        if p:
            print(f"  {p['name']}: " + " → ".join(f"{t} {a}–{b}" for t, a, b in p["path"]))


if __name__ == "__main__":
    main()
