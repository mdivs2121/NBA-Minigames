"""
build_blind_resume.py - anonymous career lines for the Blind Résumé game.

Reads the Kaggle CSVs and writes data/blind_resume.json: one entry per
career a regular fan would know: 300+ games, played from 1979-80 on, an
All-Star pick or a 17+ PPG season, and enough career Win Shares for his era.
Older careers need more, since fewer fans saw them (see ERA_WIN_SHARES).

  [ { id, name, pos, last, seasons, g, ppg, rpg, apg, spg, bpg, tsPct,
      allStar, allNba, mvp, ws }, ... ]

pos is the position he played most (PG, SG, SF, PF, C); the site only pairs
players at the same position or one step apart. last is his final season.

The site hides the name, shows the rest, and asks which of two careers was
worth more career Win Shares.

It also writes data/blind_seasons.json for the Seasons mode: single seasons
(50+ games, 20+ minutes a game) with a Box Plus/Minus good enough for their
era, strict for old seasons and loose for recent ones (see ERA_BPM):

  [ { id, name, season, teams, pos, g, mpg, ppg, rpg, apg, spg, bpg, tov,
      fgPct, threePct, tsPct, bpm }, ... ]

And data/blind_teams.json for the Teams mode: every team season from 1979-80
on, with its Four Factors (offense and defense), pace, 3-point rate, age, top
two scorers, and record. The site hides the record and names and asks which
team won more.

  [ { id, abbr, name, season, w, l, winPct, playoffs, pace, age, threeRate,
      efg, tov, orb, ftr, oppEfg, oppTov, drb, top: [{ id, name, ppg, rpg, apg }, x2] }, ... ]

Run:  python3 build_blind_resume.py
"""
import json
import re

import pandas as pd

from paths import OUT_DIR, STATS_DIR

FIRST_SEASON = 1980
MIN_GAMES = 300
PEAK_PPG = 17
SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")
POSITIONS = ["PG", "SG", "SF", "PF", "C"]

# Career Win Shares needed, by the year of a player's last season.
ERA_WIN_SHARES = [(1990, 90), (2000, 70), (2010, 50), (9999, 30)]   # before 1990: 90, 1990s: 70, ...


def era_threshold(last_season):
    return next(ws for before, ws in ERA_WIN_SHARES if last_season < before)


# Seasons mode: BPM needed, by the year a season ended. A 1990s season has to
# be really good to show up; a 2020s role player's season is fine.
ERA_BPM = [(1990, 5.0), (2000, 4.0), (2010, 2.5), (2020, 1.0), (9999, -1.0)]
SEASON_MIN_GAMES, SEASON_MIN_MPG = 50, 20


def season_label(end_year):
    return f"{end_year - 1}-{str(end_year)[-2:]}"


def num(v, digits=1):
    return None if pd.isna(v) else round(float(v), digits)


def build_teams(per_game_all):
    """Team seasons for the Teams mode."""
    t = pd.read_csv(STATS_DIR / "Team Summaries.csv")
    t = t[(t["lg"] == "NBA") & (t["season"] >= FIRST_SEASON) & (t["team"] != "League Average")]
    # Each team's players that season (per-team rows, so traded players count for each team).
    rows = per_game_all[(per_game_all["lg"] == "NBA") & (per_game_all["season"] >= FIRST_SEASON)
                        & ~per_game_all["team"].str.match(SUMMARY_TEAM).fillna(False) & (per_game_all["g"] >= 20)]
    out = []
    for r in t.sort_values(["season", "abbreviation"]).itertuples():
        roster = rows[(rows["season"] == r.season) & (rows["team"] == r.abbreviation)].nlargest(2, "pts_per_game")
        out.append({
            "id": f"{r.abbreviation}-{int(r.season)}", "abbr": r.abbreviation, "name": r.team,
            "season": season_label(int(r.season)), "w": int(r.w), "l": int(r.l),
            "winPct": round(r.w / (r.w + r.l), 3), "playoffs": bool(r.playoffs),
            "pace": num(r.pace), "age": num(r.age), "threeRate": num(r.x3p_ar, 3),
            "efg": num(r.e_fg_percent, 3), "tov": num(r.tov_percent), "orb": num(r.orb_percent), "ftr": num(r.ft_fga, 3),
            "oppEfg": num(r.opp_e_fg_percent, 3), "oppTov": num(r.opp_tov_percent), "drb": num(r.drb_percent),
            "top": [{"id": p.player_id, "name": p.player, "ppg": num(p.pts_per_game), "rpg": num(p.trb_per_game),
                     "apg": num(p.ast_per_game)} for p in roster.itertuples()],
        })
    return out


def build_seasons(per_game_all, per_game, advanced):
    """Single seasons for the Seasons mode."""
    team_rows = per_game_all[(per_game_all["lg"] == "NBA") & ~per_game_all["team"].str.match(SUMMARY_TEAM).fillna(False)]
    teams = team_rows.groupby(["player_id", "season"])["team"].apply(list)
    df = per_game.merge(advanced[["player_id", "season", "bpm", "ts_percent"]], on=["player_id", "season"])
    df["pos1"] = df["pos"].str.split("-").str[0]
    df = df[(df["season"] >= FIRST_SEASON) & (df["g"] >= SEASON_MIN_GAMES) & (df["mp_per_game"] >= SEASON_MIN_MPG)
            & df["pos1"].isin(POSITIONS) & df["bpm"].notna()]
    need = df["season"].map(lambda y: next(b for before, b in ERA_BPM if y < before))
    df = df[df["bpm"] >= need]
    out = []
    for r in df.sort_values(["season", "player_id"]).itertuples():
        out.append({
            "id": r.player_id, "name": r.player, "season": season_label(int(r.season)),
            "teams": teams.get((r.player_id, r.season), [r.team]), "pos": r.pos1,
            "g": int(r.g), "mpg": num(r.mp_per_game), "ppg": num(r.pts_per_game), "rpg": num(r.trb_per_game),
            "apg": num(r.ast_per_game), "spg": num(r.stl_per_game), "bpg": num(r.blk_per_game), "tov": num(r.tov_per_game),
            "fgPct": num(r.fg_percent, 3), "threePct": num(r.x3p_percent, 3), "tsPct": num(r.ts_percent, 3),
            "bpm": num(r.bpm),
        })
    return out


def one_row_per_season(df):
    df = df[df["lg"] == "NBA"].copy()
    df["_summary"] = df["team"].str.match(SUMMARY_TEAM).fillna(False)
    return df.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"])


def main():
    totals = one_row_per_season(pd.read_csv(STATS_DIR / "Player Totals.csv"))
    per_game_all = pd.read_csv(STATS_DIR / "Player Per Game.csv")
    per_game = one_row_per_season(per_game_all)
    advanced = one_row_per_season(pd.read_csv(STATS_DIR / "Advanced.csv"))
    all_stars = pd.read_csv(STATS_DIR / "All-Star Selections.csv")
    all_stars = all_stars[all_stars["lg"] == "NBA"].groupby("player_id").size()
    teams = pd.read_csv(STATS_DIR / "End of Season Teams.csv")
    all_nba = teams[(teams["lg"] == "NBA") & (teams["type"] == "All-NBA")].groupby("player_id").size()
    awards = pd.read_csv(STATS_DIR / "Player Award Shares.csv")
    mvps = awards[awards["winner"] & (awards["award"] == "nba mvp")].groupby("player_id").size()

    recent = set(per_game.loc[per_game["season"] >= FIRST_SEASON, "player_id"])
    peak = per_game[per_game["g"] >= 40].groupby("player_id")["pts_per_game"].max()
    c = totals.groupby("player_id")[["g", "pts", "trb", "ast", "stl", "blk", "fga", "fta"]].sum(min_count=1)
    seasons = totals.groupby("player_id")["season"].nunique()
    ws = advanced.groupby("player_id")["ws"].sum()
    names = totals.drop_duplicates("player_id", keep="last").set_index("player_id")["player"]
    positions = per_game[per_game["pos"].isin(POSITIONS)].groupby("player_id")["pos"].agg(lambda s: s.value_counts().index[0])
    last_season = per_game.groupby("player_id")["season"].max()

    out = []
    for pid, row in c.iterrows():
        if pid not in recent or row["g"] < MIN_GAMES:
            continue
        if all_stars.get(pid, 0) == 0 and peak.get(pid, 0) < PEAK_PPG:
            continue
        if pid not in positions.index or ws.get(pid, 0) < era_threshold(int(last_season[pid])):
            continue
        g = row["g"]
        per = lambda col: None if pd.isna(row[col]) else round(float(row[col]) / g, 1)
        ts_attempts = 2 * (row["fga"] + 0.44 * row["fta"])
        out.append({
            "id": pid, "name": names[pid], "pos": positions[pid], "last": int(last_season[pid]),
            "seasons": int(seasons[pid]), "g": int(g),
            "ppg": per("pts"), "rpg": per("trb"), "apg": per("ast"), "spg": per("stl"), "bpg": per("blk"),
            "tsPct": round(float(row["pts"]) / ts_attempts, 3) if ts_attempts else None,
            "allStar": int(all_stars.get(pid, 0)), "allNba": int(all_nba.get(pid, 0)), "mvp": int(mvps.get(pid, 0)),
            "ws": round(float(ws.get(pid, 0)), 1),
        })

    out.sort(key=lambda p: p["id"])
    path = OUT_DIR / "blind_resume.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(out)} careers, "
          f"by position {pd.Series([p['pos'] for p in out]).value_counts().to_dict()}")
    for pid in ("jamesle01", "millspa01"):
        print("  ", next((p for p in out if p["id"] == pid), None))

    seasons_out = build_seasons(per_game_all, per_game, advanced)
    path = OUT_DIR / "blind_seasons.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(seasons_out, f, separators=(",", ":"), ensure_ascii=False)
    decades = pd.Series([int(s["season"][:4]) // 10 * 10 for s in seasons_out]).value_counts().sort_index().to_dict()
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(seasons_out)} seasons, by decade {decades}")
    print("  ", next(s for s in seasons_out if s["id"] == "curryst01" and s["season"] == "2015-16"))

    teams_out = build_teams(per_game_all)
    path = OUT_DIR / "blind_teams.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(teams_out, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(teams_out)} team seasons")
    print("  ", next(t for t in teams_out if t["id"] == "GSW-2016"))


if __name__ == "__main__":
    main()
