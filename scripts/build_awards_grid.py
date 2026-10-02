"""
build_awards_grid.py - players and categories for the Awards Grid daily.

Writes data/awards_grid.json:

  { "cats":    [ [key, label, detail, family], ... ],
    "players": [ [id, name, from, to, fame, [cat index, ...]], ... ] }

Everyone who played an NBA season from 1979-80 on is included. A category is a
franchise (relocated teams count as one franchise, so the Seattle SuperSonics
are the Thunder), an award, a draft fact, a college, or a stat milestone. The
grid in awards.js crosses three categories with three others. Two categories
from the same family (say, two colleges, or 20 PPG and 25 PPG) never meet.

fame is career Win Shares, used to show the best-known answers and to score
how original a pick is.

Run:  python3 build_awards_grid.py
"""
import json
import re

import pandas as pd

from paths import OUT_DIR, STATS_DIR

SINCE = 1980
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")

# Relocated and renamed teams -> today's franchise.
FRANCHISE = {"NJN": "BRK", "SEA": "OKC", "VAN": "MEM", "KCK": "SAC", "SDC": "LAC", "WSB": "WAS",
             "NOH": "NOP", "NOK": "NOP", "CHA": "CHO", "CHH": "CHO", "NOJ": "UTA", "BUF": "LAC", "KCO": "SAC"}
TEAM_NAMES = {
    "ATL": "Hawks", "BOS": "Celtics", "BRK": "Nets", "CHI": "Bulls", "CHO": "Hornets", "CLE": "Cavaliers",
    "DAL": "Mavericks", "DEN": "Nuggets", "DET": "Pistons", "GSW": "Warriors", "HOU": "Rockets", "IND": "Pacers",
    "LAC": "Clippers", "LAL": "Lakers", "MEM": "Grizzlies", "MIA": "Heat", "MIL": "Bucks", "MIN": "Timberwolves",
    "NOP": "Pelicans", "NYK": "Knicks", "OKC": "Thunder", "ORL": "Magic", "PHI": "76ers", "PHO": "Suns",
    "POR": "Trail Blazers", "SAC": "Kings", "SAS": "Spurs", "TOR": "Raptors", "UTA": "Jazz", "WAS": "Wizards",
}
# Champions by season (1980 = 1979-80). Players count if the champion was the
# last team they played for that season.
CHAMPIONS = {
    1980: "LAL", 1981: "BOS", 1982: "LAL", 1983: "PHI", 1984: "BOS", 1985: "LAL", 1986: "BOS", 1987: "LAL",
    1988: "LAL", 1989: "DET", 1990: "DET", 1991: "CHI", 1992: "CHI", 1993: "CHI", 1994: "HOU", 1995: "HOU",
    1996: "CHI", 1997: "CHI", 1998: "CHI", 1999: "SAS", 2000: "LAL", 2001: "LAL", 2002: "LAL", 2003: "SAS",
    2004: "DET", 2005: "SAS", 2006: "MIA", 2007: "SAS", 2008: "BOS", 2009: "LAL", 2010: "LAL", 2011: "DAL",
    2012: "MIA", 2013: "MIA", 2014: "SAS", 2015: "GSW", 2016: "CLE", 2017: "GSW", 2018: "GSW", 2019: "TOR",
    2020: "LAL", 2021: "MIL", 2022: "GSW", 2023: "DEN", 2024: "BOS", 2025: "OKC",
}
COLLEGES = {   # name as it appears in Player Career Info -> label
    "Duke": "Duke", "Kentucky": "Kentucky", "UNC": "North Carolina", "Kansas": "Kansas", "UCLA": "UCLA",
    "Arizona": "Arizona", "Michigan State": "Michigan State", "Georgetown": "Georgetown", "Texas": "Texas",
    "Syracuse": "Syracuse", "UConn": "UConn", "Michigan": "Michigan", "Florida": "Florida", "Indiana": "Indiana",
    "Louisville": "Louisville", "Villanova": "Villanova",
}
SEASON_GAMES = 40   # a season counts toward a stat milestone with 40+ games


def main():
    per_game = pd.read_csv(STATS_DIR / "Player Per Game.csv").reset_index()
    per_game = per_game[per_game["lg"] == "NBA"].copy()
    per_game["_summary"] = per_game["team"].str.match(SUMMARY_TEAM).fillna(False)
    recent = set(per_game.loc[per_game["season"] >= SINCE, "player_id"])
    per_game = per_game[per_game["player_id"].isin(recent)]

    team_rows = per_game[~per_game["_summary"]].sort_values(["season", "index"]).copy()
    team_rows["franchise"] = team_rows["team"].replace(FRANCHISE)
    # One row per player-season: the summary row when he was traded.
    seasons = per_game.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"])

    info = pd.read_csv(STATS_DIR / "Player Career Info.csv").set_index("player_id")
    totals = pd.read_csv(STATS_DIR / "Player Totals.csv")
    totals = totals[(totals["lg"] == "NBA") & totals["player_id"].isin(recent)].copy()
    totals["_summary"] = totals["team"].str.match(SUMMARY_TEAM).fillna(False)
    totals = totals.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"])
    career_pts = totals.groupby("player_id")["pts"].sum()
    adv = pd.read_csv(STATS_DIR / "Advanced.csv")
    adv = adv[(adv["lg"] == "NBA") & adv["player_id"].isin(recent)].copy()
    adv["_summary"] = adv["team"].str.match(SUMMARY_TEAM).fillna(False)
    fame = adv.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"]).groupby("player_id")["ws"].sum()

    awards = pd.read_csv(STATS_DIR / "Player Award Shares.csv")
    awards = awards[awards["winner"] == True]
    teams_eos = pd.read_csv(STATS_DIR / "End of Season Teams.csv")
    teams_eos = teams_eos[teams_eos["lg"] == "NBA"]
    all_stars = pd.read_csv(STATS_DIR / "All-Star Selections.csv")
    draft = pd.read_csv(STATS_DIR / "Draft Pick History.csv")
    draft = draft[draft["lg"] == "NBA"].drop_duplicates("player_id").set_index("player_id")["overall_pick"]

    cats = []        # [key, label, detail, family]
    members = []     # set of player ids per category

    def add(key, label, detail, family, ids):
        ids = set(ids) & recent
        if ids:
            cats.append([key, label, detail, family])
            members.append(ids)

    for abbr, nick in TEAM_NAMES.items():
        add(f"team:{abbr}", nick, f"Played for the {nick}" + (" (or the franchise before it moved)" if abbr in FRANCHISE.values() else ""),
            "team", team_rows.loc[team_rows["franchise"] == abbr, "player_id"])

    for key, label, detail in [("nba mvp", "MVP", "Won MVP"), ("nba dpoy", "DPOY", "Won Defensive Player of the Year"),
                               ("nba roy", "Rookie of the Year", "Won Rookie of the Year"),
                               ("nba smoy", "Sixth Man", "Won Sixth Man of the Year"), ("nba mip", "Most Improved", "Won Most Improved Player")]:
        add(key.split()[1], label, detail, "award-" + key.split()[1], awards.loc[awards["award"] == key, "player_id"])
    add("allstar", "All-Star", "Made an All-Star team", "allstar", all_stars.loc[all_stars["lg"] == "NBA", "player_id"])
    add("allnba", "All-NBA", "Made an All-NBA team", "allnba", teams_eos.loc[teams_eos["type"] == "All-NBA", "player_id"])
    add("alldef", "All-Defense", "Made an All-Defensive team", "alldef", teams_eos.loc[teams_eos["type"] == "All-Defense", "player_id"])
    last_team = team_rows.groupby(["player_id", "season"])["team"].last().reset_index()
    champs = last_team[last_team.apply(lambda r: CHAMPIONS.get(r["season"]) == r["team"], axis=1)]["player_id"]
    add("champ", "Champion", "Won an NBA title (1980–2025)", "champ", champs)
    add("hof", "Hall of Famer", "In the Basketball Hall of Fame", "hof", info.index[info["hof"] == True])

    add("pick1", "#1 pick", "Drafted first overall", "draft", draft.index[draft == 1])
    add("top5", "Top-5 pick", "Drafted in the top five", "draft", draft.index[draft <= 5])
    add("undrafted", "Undrafted", "Never drafted", "draft", recent - set(draft.index))

    full = seasons[seasons["g"] >= SEASON_GAMES]
    add("ppg25", "25+ PPG season", "Averaged 25+ points in a season (40+ games)", "scoring", full.loc[full["pts_per_game"] >= 25, "player_id"])
    add("ppg20", "20+ PPG season", "Averaged 20+ points in a season (40+ games)", "scoring", full.loc[full["pts_per_game"] >= 20, "player_id"])
    add("rpg10", "10+ RPG season", "Averaged 10+ rebounds in a season (40+ games)", "rebounding", full.loc[full["trb_per_game"] >= 10, "player_id"])
    add("apg8", "8+ APG season", "Averaged 8+ assists in a season (40+ games)", "passing", full.loc[full["ast_per_game"] >= 8, "player_id"])
    add("bpg2", "2+ BPG season", "Averaged 2+ blocks in a season (40+ games)", "blocks", full.loc[full["blk_per_game"] >= 2, "player_id"])
    threes = full[(full["x3pa_per_game"] * full["g"] >= 150) & (full["x3p_percent"] >= 0.4)]
    add("3p40", "40% from three", "Shot 40%+ from three in a season (150+ attempts)", "shooting", threes["player_id"])
    add("pts20k", "20,000 points", "Scored 20,000+ career points", "career", career_pts.index[career_pts >= 20000])
    add("pts10k", "10,000 points", "Scored 10,000+ career points", "career", career_pts.index[career_pts >= 10000])
    n_seasons = seasons.groupby("player_id").size()
    add("seasons15", "15+ seasons", "Played 15+ NBA seasons", "longevity", n_seasons.index[n_seasons >= 15])
    n_franchises = team_rows.groupby("player_id")["franchise"].nunique()
    add("teams6", "6+ teams", "Played for 6+ franchises", "journeyman", n_franchises.index[n_franchises >= 6])

    college_lists = info["colleges"].fillna("").map(lambda s: [c.strip() for c in s.split(",") if c.strip()])
    for listed, label in COLLEGES.items():
        add(f"college:{listed}", label, f"Played college ball at {label}", "college",
            college_lists.index[college_lists.map(lambda cs: listed in cs)])
    add("nocollege", "No college", "Skipped college (high school or overseas)", "college", college_lists.index[college_lists.map(len) == 0])

    span = seasons.groupby("player_id")["season"].agg(["min", "max"])
    by_player = {pid: [] for pid in recent}
    for i, ids in enumerate(members):
        for pid in ids:
            by_player[pid].append(i)
    players = []
    for pid in sorted(recent):
        if pid not in info.index:
            continue
        players.append([pid, info.at[pid, "player"], int(span.at[pid, "min"]), int(span.at[pid, "max"]),
                        round(float(fame.get(pid, 0)), 1), sorted(by_player[pid])])

    path = OUT_DIR / "awards_grid.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"cats": cats, "players": players}, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(players)} players, {len(cats)} categories")
    for c, ids in zip(cats, members):
        if c[3] != "team":
            print(f"  {c[1]:22} {len(ids)}")


if __name__ == "__main__":
    main()
