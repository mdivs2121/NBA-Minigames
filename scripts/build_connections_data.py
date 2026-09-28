"""
build_connections_data.py - player groups for the Connections daily puzzle.

Reads the Kaggle dataset "NBA Stats (1947-present)" and writes
data/connections.json:

  { "players": { id: name }, "fame": { id: score },
    "categories": [ { label, tier, members: [id, ...] }, ... ] }

Only recognizable players (a 14+ PPG season, an All-Star pick, or a major
award, all since 1979-80) are in the pool, and every category lists ALL of
its pool members. The site relies on that to guarantee each puzzle has one
answer: no player in the grid may fit a second chosen group.

Tiers, easiest to hardest: 1 colleges, 2 teams and awards, 3 career facts,
4 wordplay.

Run:  python3 build_connections_data.py
"""
import json
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd
from paths import OUT_DIR, STATS_DIR


FIRST_SEASON = 1980
MIN_MEMBERS = 6      # a category needs room to pick 4 that fit no other group
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")

# Relocated teams count as one franchise.
FRANCHISES = {
    "ATL": "the Hawks", "BOS": "the Celtics", "BRK": "the Nets", "NJN": "the Nets", "CHI": "the Bulls",
    "CHH": "Charlotte", "CHA": "Charlotte", "CHO": "Charlotte", "CLE": "the Cavaliers", "DAL": "the Mavericks",
    "DEN": "the Nuggets", "DET": "the Pistons", "GSW": "the Warriors", "HOU": "the Rockets", "IND": "the Pacers",
    "LAC": "the Clippers", "SDC": "the Clippers", "LAL": "the Lakers", "MEM": "the Grizzlies", "VAN": "the Grizzlies",
    "MIA": "the Heat", "MIL": "the Bucks", "MIN": "the Timberwolves", "NOH": "New Orleans", "NOK": "New Orleans",
    "NOP": "New Orleans", "NYK": "the Knicks", "OKC": "the Sonics/Thunder", "SEA": "the Sonics/Thunder",
    "ORL": "the Magic", "PHI": "the 76ers", "PHO": "the Suns", "POR": "the Trail Blazers", "SAC": "the Kings",
    "KCK": "the Kings", "SAS": "the Spurs", "TOR": "the Raptors", "UTA": "the Jazz", "WAS": "the Bullets/Wizards",
    "WSB": "the Bullets/Wizards",
}
COLLEGES = {   # label -> names as they appear in the data
    "Duke": ["Duke"], "Kentucky": ["Kentucky"], "North Carolina": ["UNC"], "Kansas": ["Kansas"],
    "UCLA": ["UCLA"], "Michigan State": ["Michigan State"], "Arizona": ["Arizona"], "Syracuse": ["Syracuse"],
    "Georgetown": ["Georgetown"], "Texas": ["Texas"], "Villanova": ["Villanova"], "Indiana": ["Indiana"],
    "Michigan": ["Michigan"], "Florida": ["Florida"], "UConn": ["UConn", "Connecticut"], "Gonzaga": ["Gonzaga"],
    "LSU": ["LSU"], "Ohio State": ["Ohio State"], "Louisville": ["Louisville"], "Wake Forest": ["Wake Forest"],
    "Memphis": ["Memphis"], "Georgia Tech": ["Georgia Tech"], "Alabama": ["Alabama"], "Arkansas": ["Arkansas"],
}
AWARDS = {"nba mvp": "Won MVP", "nba dpoy": "Won Defensive Player of the Year", "nba roy": "Won Rookie of the Year",
          "nba smoy": "Won Sixth Man of the Year", "nba mip": "Won Most Improved Player"}
COLORS = {"Green", "Brown", "White", "Black", "Gray", "Grey", "Gold", "Rose", "Blue"}


def one_row_per_season(df):
    df = df[df["lg"] == "NBA"].copy()
    df["_summary"] = df["team"].str.match(SUMMARY_TEAM).fillna(False)
    return df.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"])


def name_parts(name):
    words = [w for w in name.replace(".", "").split() if w not in {"Jr", "Sr", "II", "III", "IV"}]
    return words[0], words[-1]


def main():
    per_game_all = pd.read_csv(STATS_DIR / "Player Per Game.csv")
    per_game = one_row_per_season(per_game_all)
    recent = per_game[per_game["season"] >= FIRST_SEASON]
    awards = pd.read_csv(STATS_DIR / "Player Award Shares.csv")
    winners = awards[awards["winner"] & awards["award"].isin(AWARDS)]
    all_stars = pd.read_csv(STATS_DIR / "All-Star Selections.csv")
    all_stars = all_stars[(all_stars["lg"] == "NBA") & (all_stars["season"] >= FIRST_SEASON)]
    info = pd.read_csv(STATS_DIR / "Player Career Info.csv").set_index("player_id")
    draft = pd.read_csv(STATS_DIR / "Draft Pick History.csv")
    draft = draft[draft["lg"] == "NBA"].set_index("player_id")
    totals = one_row_per_season(pd.read_csv(STATS_DIR / "Player Totals.csv"))
    career_pts = totals.groupby("player_id")["pts"].sum()

    # The pool: recognizable players since 1979-80
    scorers = set(recent.loc[(recent["pts_per_game"] >= 14) & (recent["g"] >= 40), "player_id"])
    pool = scorers | set(all_stars["player_id"]) | set(winners.loc[winners["season"] >= FIRST_SEASON, "player_id"])
    pool = {p for p in pool if p in info.index}
    names = recent.drop_duplicates("player_id").set_index("player_id")["player"]
    players = {p: names.get(p, info.at[p, "player"]) for p in pool}

    groups = defaultdict(set)   # (label, tier) -> members

    # Tier 1: colleges
    for pid in pool:
        colleges = info.at[pid, "colleges"]
        listed = [] if pd.isna(colleges) else [c.strip() for c in colleges.split(",")]
        for label, spellings in COLLEGES.items():
            if any(c in spellings for c in listed):
                groups[(f"Went to {label}", 1)].add(pid)
        if not listed:
            groups[("Never played in college", 3)].add(pid)

    # Tier 2: franchises and awards
    team_rows = per_game_all[(per_game_all["lg"] == "NBA") & ~per_game_all["team"].str.match(SUMMARY_TEAM).fillna(False)]
    franchises = team_rows[team_rows["player_id"].isin(pool)].groupby("player_id")["team"].apply(
        lambda ts: {FRANCHISES[t] for t in ts if t in FRANCHISES})
    for pid, fs in franchises.items():
        for f in fs:
            groups[(f"Played for {f}", 2)].add(pid)
    for r in winners.itertuples():
        if r.player_id in pool:
            groups[(AWARDS[r.award], 2)].add(r.player_id)
    for pid in pool:
        if pid in draft.index:
            d = draft.loc[pid]
            d = d.iloc[0] if isinstance(d, pd.DataFrame) else d
            if int(d["overall_pick"]) == 1:
                groups[("#1 overall picks", 2)].add(pid)
            elif int(d["round"]) >= 2:
                groups[("Second-round picks", 3)].add(pid)

    # Tier 3: career facts
    seasons = per_game[per_game["player_id"].isin(pool)].groupby("player_id")["season"].nunique()
    for pid in pool:
        ht = info.at[pid, "ht_in_in"]
        if not pd.isna(ht) and ht >= 84:
            groups[("7 feet or taller", 3)].add(pid)
        if not pd.isna(ht) and ht <= 72:
            groups[("6 feet or shorter", 3)].add(pid)
        fs = franchises.get(pid, set())
        if len(fs) >= 7:
            groups[("Played for 7+ franchises", 3)].add(pid)
        if len(fs) == 1 and seasons.get(pid, 0) >= 10:
            groups[("Spent 10+ seasons with only one franchise", 3)].add(pid)
        if career_pts.get(pid, 0) >= 20000:
            groups[("Scored 20,000+ career points", 3)].add(pid)
        if bool(info.at[pid, "hof"]):
            groups[("Hall of Famers", 3)].add(pid)

    # Tier 4: wordplay
    firsts, lasts = defaultdict(set), defaultdict(set)
    for pid, n in players.items():
        first, last = name_parts(n)
        firsts[first].add(pid)
        lasts[last].add(pid)
        if last in COLORS:
            groups[("Last name is a color", 4)].add(pid)
        if first[0] == last[0] and first[0].isalpha():
            groups[("Same first letter, first and last name", 4)].add(pid)
    for first, members in firsts.items():
        groups[(f"First name {first}", 4)] |= members
    for last, members in lasts.items():
        groups[(f"Last name {last}", 4)] |= members

    categories = [
        {"label": label, "tier": tier, "members": sorted(members)}
        for (label, tier), members in sorted(groups.items())
        if len(members) >= MIN_MEMBERS
    ]
    used = {m for c in categories for m in c["members"]}

    # Fame: how likely a casual fan knows the name. All-Star picks and awards
    # count most, then peak scoring, with a bump for playing after 2000.
    star_count = all_stars.groupby("player_id").size()
    award_count = winners.groupby("player_id").size()
    peak = recent.groupby("player_id")["pts_per_game"].max()
    last = recent.groupby("player_id")["season"].max()
    fame = {p: round(4 * star_count.get(p, 0) + 3 * award_count.get(p, 0) + peak.get(p, 0)
                     + (6 if last.get(p, 0) >= 2001 else 0), 1) for p in sorted(used)}

    out = {"players": {p: players[p] for p in sorted(used)}, "fame": fame, "categories": categories}

    path = OUT_DIR / "connections.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): pool {len(pool)}, {len(categories)} categories")
    for tier in (1, 2, 3, 4):
        cats = [c for c in categories if c["tier"] == tier]
        print(f"  tier {tier}: {len(cats)} ->", ", ".join(f"{c['label']} ({len(c['members'])})" for c in cats[:8]), "…" if len(cats) > 8 else "")


if __name__ == "__main__":
    main()
