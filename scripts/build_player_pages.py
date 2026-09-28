"""
build_player_pages.py - data for the player pages (player.html?id=jamesle01).

Reads the Kaggle dataset "NBA Stats (1947-present)" and writes:
  data/player/index.json   { id: [name, first season, last season] }  (for search)
  data/player/a.json ...   { id: { name, bio, draft, awards, teams, seasons, career } }

Players are split into one file per first letter of their ID so a page only
loads what it needs. Included: everyone who played an NBA season from 1979-80
on (with their whole career), plus every draft pick from 1989-2021, even ones
who never played.

Run:  python3 build_player_pages.py
"""
import json
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd
from paths import OUT_DIR, STATS_DIR

OUT_DIR = OUT_DIR / "player"

FIRST_SEASON = 1980
DRAFT_YEARS = (1989, 2021)
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")
AWARD_NAMES = {
    "nba mvp": "MVP",
    "nba dpoy": "Defensive Player of the Year",
    "nba roy": "Rookie of the Year",
    "nba smoy": "Sixth Man of the Year",
    "nba mip": "Most Improved Player",
    "nba clutch_poy": "Clutch Player of the Year",
}


def season_label(end_year: int) -> str:
    return f"{end_year - 1}-{str(end_year)[-2:]}"


def nba_only(df: pd.DataFrame) -> pd.DataFrame:
    return df[df["lg"].isin(["NBA", "BAA"])]


def one_row_per_season(df: pd.DataFrame) -> pd.DataFrame:
    """Traded players have a row per team plus a total row; keep just the total."""
    df = nba_only(df).copy()
    df["_summary"] = df["team"].str.match(SUMMARY_TEAM).fillna(False)
    return df.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"])


def num(v, digits=1):
    return None if pd.isna(v) else round(float(v), digits)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    per_game_all = pd.read_csv(STATS_DIR / "Player Per Game.csv")
    per_game = one_row_per_season(per_game_all)
    advanced = one_row_per_season(pd.read_csv(STATS_DIR / "Advanced.csv"))
    totals = one_row_per_season(pd.read_csv(STATS_DIR / "Player Totals.csv"))
    career_info = pd.read_csv(STATS_DIR / "Player Career Info.csv").set_index("player_id")
    draft = pd.read_csv(STATS_DIR / "Draft Pick History.csv")
    draft = draft[draft["lg"] == "NBA"]
    awards = pd.read_csv(STATS_DIR / "Player Award Shares.csv")
    all_stars = nba_only(pd.read_csv(STATS_DIR / "All-Star Selections.csv"))
    season_teams = nba_only(pd.read_csv(STATS_DIR / "End of Season Teams.csv"))

    # Who gets a page
    ids = set(per_game.loc[per_game["season"] >= FIRST_SEASON, "player_id"])
    ids |= set(draft.loc[draft["season"].between(*DRAFT_YEARS), "player_id"])

    team_rows = nba_only(per_game_all)
    team_rows = team_rows[~team_rows["team"].str.match(SUMMARY_TEAM).fillna(False)]
    teams_by_season = team_rows.groupby(["player_id", "season"])["team"].apply(list)
    ws = advanced.set_index(["player_id", "season"])["ws"]

    # Sorted, so every run writes the files in the same order.
    players = {pid: {"seasons": [], "awards": defaultdict(list), "teams": defaultdict(list)} for pid in sorted(ids)}

    for r in per_game[per_game["player_id"].isin(ids)].sort_values("season").itertuples():
        p = players[r.player_id]
        p["name"] = r.player
        p["seasons"].append({
            "season": season_label(r.season),
            "age": None if pd.isna(r.age) else int(r.age),
            "teams": teams_by_season.get((r.player_id, r.season), [r.team]),
            "g": int(r.g), "mpg": num(r.mp_per_game),
            "ppg": num(r.pts_per_game), "rpg": num(r.trb_per_game), "apg": num(r.ast_per_game),
            "spg": num(r.stl_per_game), "bpg": num(r.blk_per_game),
            "fg": num(r.fg_percent, 3), "tp": num(r.x3p_percent, 3), "ft": num(r.ft_percent, 3),
            "ws": num(ws.get((r.player_id, r.season))),
        })

    career = totals[totals["player_id"].isin(ids)].groupby("player_id")[["g", "pts", "trb", "ast", "stl", "blk"]].sum(min_count=1)
    career_ws = advanced[advanced["player_id"].isin(ids)].groupby("player_id")["ws"].sum()
    for pid, row in career.iterrows():
        g = int(row["g"]) if not pd.isna(row["g"]) else 0
        c = {k: None if pd.isna(row[k]) else int(row[k]) for k in ["pts", "trb", "ast", "stl", "blk"]}
        c["g"] = g
        c["ws"] = num(career_ws.get(pid))
        for k, short in [("pts", "ppg"), ("trb", "rpg"), ("ast", "apg")]:
            c[short] = round(c[k] / g, 1) if g and c[k] is not None else None
        players[pid]["career"] = c

    for r in draft[draft["player_id"].isin(ids)].itertuples():
        players[r.player_id]["draft"] = {"year": int(r.season), "pick": int(r.overall_pick), "round": int(r.round), "team": r.tm}
        players[r.player_id].setdefault("name", r.player)

    for r in awards[awards["winner"] & awards["award"].isin(AWARD_NAMES) & awards["player_id"].isin(ids)].itertuples():
        players[r.player_id]["awards"][AWARD_NAMES[r.award]].append(season_label(r.season))
    for r in all_stars[all_stars["player_id"].isin(ids)].itertuples():
        players[r.player_id]["awards"]["All-Star"].append(season_label(r.season))
    for r in season_teams[season_teams["player_id"].isin(ids)].itertuples():
        players[r.player_id]["teams"][f"{r.type} {r.number_tm}"].append(season_label(r.season))

    index, shards = {}, defaultdict(dict)
    for pid, p in players.items():
        info = career_info.loc[pid] if pid in career_info.index else None
        if info is not None:
            p["bio"] = {
                "pos": None if pd.isna(info["pos"]) else info["pos"],
                "ht": None if pd.isna(info["ht_in_in"]) else int(info["ht_in_in"]),
                "wt": None if pd.isna(info["wt"]) else int(info["wt"]),
                "born": None if pd.isna(info["birth_date"]) else str(info["birth_date"])[:10],
                "colleges": [] if pd.isna(info["colleges"]) else [c.strip() for c in info["colleges"].split(",")],
                "hof": bool(info["hof"]),
            }
            p.setdefault("name", info["player"])
        p["awards"] = {k: sorted(v) for k, v in p["awards"].items()}
        p["teams"] = {k: sorted(v) for k, v in p["teams"].items()}
        seasons = p["seasons"]
        index[pid] = [p["name"], seasons[0]["season"] if seasons else None, seasons[-1]["season"] if seasons else None]
        shards[pid[0]][pid] = p

    for letter, group in shards.items():
        with open(OUT_DIR / f"{letter}.json", "w", encoding="utf-8") as f:
            json.dump(group, f, separators=(",", ":"), ensure_ascii=False)
    with open(OUT_DIR / "index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"), ensure_ascii=False)

    sizes = sorted((p.stat().st_size for p in OUT_DIR.glob("?.json")), reverse=True)
    print(f"{len(index)} players in {len(shards)} files (biggest {sizes[0] / 1024:.0f} KB), "
          f"index {(OUT_DIR / 'index.json').stat().st_size / 1024:.0f} KB")
    lebron = shards["j"]["jamesle01"]
    print("LeBron:", lebron["bio"], "| awards:", {k: len(v) for k, v in lebron["awards"].items()},
          "| All-NBA:", sum(len(v) for k, v in lebron["teams"].items() if k.startswith("All-NBA")),
          "| career:", lebron["career"])


if __name__ == "__main__":
    main()
