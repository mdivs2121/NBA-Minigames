"""
build_data.py - one-time preprocessing for the NBA browser game.

Reads the Kaggle dataset "NBA Stats (1947-present)" (Sumitro Datta) and writes:
  data/players.json         { playerId: { name } }
  data/player_seasons.json  [ { playerId, season, teams, stats } ]
  data/rosters.json         { "2009-10 LAL": [playerId, ...] }
  data/teammate_graph.json  { playerId: [teammateId, ...] }

Run:  python3 build_data.py
"""
import json
import re
from collections import defaultdict, deque
from itertools import combinations
from pathlib import Path

import pandas as pd
from paths import OUT_DIR, STATS_DIR

RAW_FILE = STATS_DIR / "Player Per Game.csv"

# The dataset labels seasons by the year they END: 2006 means 2005-06.
FIRST_SEASON = 2006

# CSV column -> name used in your JSON. Check these against your CSV's real headers.
STAT_COLUMNS = {
    "g": "games",
    "pts_per_game": "ppg",
    "trb_per_game": "rpg",
    "ast_per_game": "apg",
    "stl_per_game": "spg",
    "blk_per_game": "bpg",
    "fg_percent": "fgPct",
    "x3p_percent": "threePct",
    "ft_percent": "ftPct",
}

# Traded players get one row per team PLUS a season-total row labeled
# "TOT" (older versions) or "2TM"/"3TM" (newer versions).
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")


def season_label(end_year: int) -> str:
    """2006 -> '2005-06'"""
    return f"{end_year - 1}-{str(end_year)[-2:]}"


def write_json(name: str, data) -> None:
    path = OUT_DIR / name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB)")


def shortest_path(graph: dict, start: str, goal: str):
    """BFS - the same algorithm your site will use for Teammate Chain."""
    if start == goal:
        return [start]
    prev = {start: None}
    queue = deque([start])
    while queue:
        current = queue.popleft()
        for nxt in graph.get(current, []):
            if nxt not in prev:
                prev[nxt] = current
                if nxt == goal:
                    path = [goal]
                    while prev[path[-1]] is not None:
                        path.append(prev[path[-1]])
                    return path[::-1]
                queue.append(nxt)
    return None


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(RAW_FILE)

    # 1. Filter: NBA only (dataset also has ABA/BAA), 2005-06 onward
    df = df[(df["lg"] == "NBA") & (df["season"] >= FIRST_SEASON)].copy()

    is_summary = df["team"].str.match(SUMMARY_TEAM)
    team_rows = df[~is_summary]  # one row per player, per team, per season

    # 2. players.json
    names = df.drop_duplicates("player_id").set_index("player_id")["player"]
    players = {pid: {"name": name} for pid, name in names.items()}

    # 3. player_seasons.json
    # Teams come from the per-team rows; stats come from the season-total row
    # if the player was traded, otherwise from their single team row.
    teams_by_key = team_rows.groupby(["player_id", "season"])["team"].apply(list)
    df["_order"] = (~is_summary).astype(int)  # summary rows sort first
    stat_rows = df.sort_values("_order").drop_duplicates(["player_id", "season"])

    player_seasons = []
    for row in stat_rows.to_dict("records"):
        stats = {}
        for src, dst in STAT_COLUMNS.items():
            val = row.get(src)
            stats[dst] = None if pd.isna(val) else round(float(val), 3)
        player_seasons.append({
            "playerId": row["player_id"],
            "season": season_label(row["season"]),
            "teams": teams_by_key.get((row["player_id"], row["season"]), []),
            "stats": stats,
        })

    # 4. rosters.json - who was on each team each season.
    # Your site uses this to explain a link: "teammates on the 2009-10 LAL".
    rosters = defaultdict(list)
    unique = team_rows[["player_id", "season", "team"]].drop_duplicates()
    for pid, season, team in unique.itertuples(index=False):
        rosters[f"{season_label(season)} {team}"].append(pid)

    # 5. teammate_graph.json - your rule: same team, same season
    graph = defaultdict(set)
    for ids in rosters.values():
        for a, b in combinations(ids, 2):
            graph[a].add(b)
            graph[b].add(a)
    graph = {pid: sorted(n) for pid, n in graph.items()}

    write_json("players.json", players)
    write_json("player_seasons.json", player_seasons)
    write_json("rosters.json", rosters)
    write_json("teammate_graph.json", graph)

    # 6. Sanity checks - eyeball these before trusting the data
    edges = sum(len(n) for n in graph.values()) // 2
    print(f"\n{len(players)} players, {len(player_seasons)} player-seasons, "
          f"{len(rosters)} team-seasons, {edges} teammate links")
    a, b = "jamesle01", "wembavi01"  # LeBron -> Wembanyama
    if a in graph and b in graph:
        path = shortest_path(graph, a, b)
        print("Test chain:", " -> ".join(players[p]["name"] for p in path))
    else:
        print("Test IDs not found - check the player_id format in your CSV")


if __name__ == "__main__":
    main()
