"""
build_trivia.py - the question bank for Trivia Wager.

Writes data/trivia.json:

  { "cats": [ [id, name], ... ],
    "questions": [ [cat, question, answer, kind, [accepted forms], note], ... ] }

Answers are typed, not picked. kind tells the game how to judge them:
  player  full names (the game also accepts last names) plus nicknames
  team    full name, nickname, city, abbreviation, slang (Cavs, Sixers)
  num     the number has to appear
  year    the year, or just its last two digits
  text    any of the forms, typos forgiven
  all     every part has to appear (parts separated by |-alternatives)

Hand-written categories come from trivia_curated.py (history, jersey numbers,
trades, coaches, what year, playoff stat lines, some records). Everything
else is built from the stats CSVs, so the answers can't drift from the data:
Finals winners and losers, MVP, DPOY, the draft, guess the college, teammate
guess, memorable stat lines, guess the player, the 2025-26 season, and career
records. The wrong answers come from the same data (the MVP runner-ups, the
next picks in that draft, and so on) so they're believable.

Run after build_guess_player.py:  python3 build_trivia.py
"""
import json
import random
import re
from collections import Counter, defaultdict

import pandas as pd

from build_awards_grid import CHAMPIONS, award_winners
from paths import OUT_DIR, STATS_DIR
from trivia_curated import ACCEPT, CURATED

SUMMARY_TEAM = re.compile(r"^(TOT|\dTM)$")
CURRENT = 2026   # the 2025-26 season
EAST = set("ATL BOS BRK CHO CHI CLE DET IND MIA MIL NYK ORL PHI TOR WAS".split())

CATS = [
    ("history", "History"), ("champs", "Finals Winners"), ("losers", "Finals Losers"), ("mvp", "NBA MVP"),
    ("dpoy", "Defensive Player of the Year"), ("statlines", "Memorable Stat Lines"),
    ("playoffs", "Memorable Playoff Stat Lines"), ("season", "2025-26 Season"), ("jerseys", "Jersey Numbers"),
    ("trades", "Trades & Free Agency"), ("records", "Records"), ("draft", "The Draft"), ("year", "What Year?"),
    ("guess", "Guess the Player"), ("coaches", "Coaches & GMs"), ("teammates", "Teammate Guess"),
    ("college", "Guess the College"), ("fmvp", "Finals MVP"),
]

# Nicknames people actually type.
PLAYER_ALIASES = {
    "LeBron James": ["LeBron", "LBJ", "King James", "Bron"], "Giannis Antetokounmpo": ["Giannis", "Greek Freak"],
    "Shaquille O'Neal": ["Shaq"], "Kobe Bryant": ["Kobe"], "Magic Johnson": ["Magic"], "Kareem Abdul-Jabbar": ["Kareem"],
    "Wilt Chamberlain": ["Wilt"], "Hakeem Olajuwon": ["Hakeem", "The Dream"], "Michael Jordan": ["MJ"], "Kevin Durant": ["KD"],
    "Anthony Davis": ["AD"], "Chris Paul": ["CP3"], "Shai Gilgeous-Alexander": ["SGA", "Shai"], "Victor Wembanyama": ["Wemby"],
    "Nikola Jokić": ["Joker"], "Luka Dončić": ["Luka"], "Stephen Curry": ["Steph"], "Dirk Nowitzki": ["Dirk"],
    "Carmelo Anthony": ["Melo"], "Damian Lillard": ["Dame"], "Karl-Anthony Towns": ["KAT"], "Dwyane Wade": ["D-Wade", "DWade"],
    "Allen Iverson": ["AI"], "Tim Duncan": ["Timmy"], "Kawhi Leonard": ["Kawhi"], "Karl Malone": ["Mailman", "The Mailman"],
    "Charles Barkley": ["Chuck"], "Kevin Garnett": ["KG"], "Russell Westbrook": ["Russ"], "Tracy McGrady": ["T-Mac", "TMac"],
    "Vince Carter": ["Vinsanity"], "Jimmy Butler": ["Jimmy Buckets"], "Zion Williamson": ["Zion"], "Ja Morant": ["Ja"],
    "Klay Thompson": ["Klay"], "Draymond Green": ["Draymond", "Dray"], "Manu Ginóbili": ["Manu"], "Yao Ming": ["Yao"],
    "Kyrie Irving": ["Kyrie"], "Pau Gasol": ["Pau"], "Isiah Thomas": ["Zeke"], "Dennis Rodman": ["The Worm"],
    "Paul Pierce": ["The Truth"], "Joel Embiid": ["Jojo"], "Scottie Pippen": ["Pip"], "Patrick Ewing": ["Ewing"],
    # coaches and executives
    "Gregg Popovich": ["Pop", "Coach Pop"], "Phil Jackson": ["Zen Master"], "Red Auerbach": ["Red"], "Pat Riley": ["Riles"],
    "Erik Spoelstra": ["Spo"], "Steve Kerr": ["Kerr"], "Rudy Tomjanovich": ["Rudy T"], "Mike D'Antoni": ["Dantoni"],
}
TEAM_SLANG = {
    "76ers": ["Sixers"], "Cavaliers": ["Cavs"], "Mavericks": ["Mavs"], "Timberwolves": ["Wolves", "T-Wolves"],
    "SuperSonics": ["Sonics"], "Trail Blazers": ["Blazers"], "Warriors": ["Dubs"], "Celtics": ["Celts"],
    "Pelicans": ["Pels"], "Clippers": ["Clips", "LA Clippers"], "Lakers": ["LA Lakers"], "Knicks": ["NY Knicks"],
}
COLLEGE_ALIASES = {
    "UNC": ["North Carolina", "Carolina", "Tar Heels"], "UConn": ["Connecticut", "Huskies"], "Kentucky": ["UK", "Wildcats"],
    "Michigan State": ["Michigan St", "MSU", "Spartans"], "LSU": ["Louisiana State"], "USC": ["Southern California", "Southern Cal"],
    "NC State": ["North Carolina State"], "UNLV": ["Nevada Las Vegas"], "Duke": ["Blue Devils"], "Kansas": ["KU", "Jayhawks"],
    "Ohio State": ["Ohio St"], "Arizona State": ["Arizona St", "ASU"], "Florida State": ["Florida St", "FSU"],
    "Oklahoma State": ["Oklahoma St"], "Georgia Tech": ["GA Tech"], "Texas A&M": ["Texas AM", "A&M"], "Gonzaga": ["Zags"],
    "Villanova": ["Nova"], "Memphis": ["Memphis State"], "Wake Forest": ["Wake"], "Saint Joseph's": ["St Josephs", "St Joes"],
}
SUFFIXES = {"Jr.", "Sr.", "II", "III", "IV"}

# Finals losers by season (1991 = the 1990-91 season).
FINALS_LOSERS = {
    1991: "LAL", 1992: "POR", 1993: "PHO", 1994: "NYK", 1995: "ORL", 1996: "SEA", 1997: "UTA", 1998: "UTA",
    1999: "NYK", 2000: "IND", 2001: "PHI", 2002: "NJN", 2003: "NJN", 2004: "LAL", 2005: "DET", 2006: "DAL",
    2007: "CLE", 2008: "LAL", 2009: "ORL", 2010: "BOS", 2011: "MIA", 2012: "OKC", 2013: "SAS", 2014: "MIA",
    2015: "CLE", 2016: "GSW", 2017: "CLE", 2018: "CLE", 2019: "GSW", 2020: "MIA", 2021: "PHO", 2022: "BOS",
    2023: "MIA", 2024: "DAL", 2025: "IND",
}

R = random.Random(424)   # fixed, so the bank comes out the same every build


def season_text(s):
    return f"{s - 1}-{str(s)[-2:]}"


def pick_wrong(answer, pool, n=3):
    """n distinct wrong answers from pool, never the answer."""
    seen, out = {answer}, []
    for x in pool:
        if x not in seen:
            seen.add(x); out.append(x)
        if len(out) == n:
            return out
    return None


def main():
    qs = [[q[0], q[1], q[2], None, q[4]] for q in CURATED]   # kind and forms get filled in at the end
    counts = Counter()

    def add(cat, q, answer, wrong, note="", accept=None):
        # wrong answers aren't shown any more (answers are typed), but they still
        # guard quality: a question needs three believable alternatives to exist.
        if wrong is None or len(wrong) < 3:
            return
        qs.append([cat, q, str(answer), accept, note])
        counts[cat] += 1

    # ---------- shared data ----------
    teams = pd.read_csv(STATS_DIR / "Team Summaries.csv")
    teams = teams[(teams["lg"] == "NBA") & (teams["team"] != "League Average")]
    team_name = {(r.season, r.abbreviation): r.team for r in teams.itertuples()}
    pg = pd.read_csv(STATS_DIR / "Player Per Game.csv")
    pg = pg[pg["lg"] == "NBA"].copy()
    pg["_summary"] = pg["team"].str.match(SUMMARY_TEAM).fillna(False)
    seasons_one = pg.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"])
    team_rows = pg[~pg["_summary"]]
    info = pd.read_csv(STATS_DIR / "Player Career Info.csv").set_index("player_id")
    nm = lambda pid: info.at[pid, "player"] if pid in info.index else pid
    stars = pd.read_csv(STATS_DIR / "All-Star Selections.csv")
    stars = stars[stars["lg"] == "NBA"]
    star_count = stars.groupby("player_id").size()

    # ---------- Finals winners (2001 on, without saying so) ----------
    for season in range(2001, 2026):
        champ = CHAMPIONS[season]
        others = teams[(teams.season == season) & (teams.abbreviation != champ)].sort_values("w", ascending=False)
        add("champs", f"Which team won the {season} NBA title?", team_name[(season, champ)],
            pick_wrong(team_name[(season, champ)], list(others.team)),
            f"They beat the {team_name[(season, FINALS_LOSERS[season])]} in the Finals.")

    # ---------- Finals losers ----------
    for season, loser in FINALS_LOSERS.items():
        champ = CHAMPIONS[season]
        others = teams[(teams.season == season) & (~teams.abbreviation.isin([champ, loser]))].sort_values("w", ascending=False)
        add("losers", f"Who lost to the {team_name[(season, champ)]} in the {season} Finals?", team_name[(season, loser)],
            pick_wrong(team_name[(season, loser)], list(others.team)),
            f"The {team_name[(season, champ)]} won the {season} title.")

    # ---------- MVP and DPOY (wrong answers: the next vote-getters) ----------
    shares = pd.read_csv(STATS_DIR / "Player Award Shares.csv")
    winners = award_winners()
    for award, cat, since, label in [("nba mvp", "mvp", 1980, "MVP"), ("nba dpoy", "dpoy", 1983, "Defensive Player of the Year")]:
        for season in range(since, 2026):
            w = winners[(winners.award == award) & (winners.season == season)]
            if w.empty:
                continue
            win_name = w.iloc[0]["player"]
            race = shares[(shares.award == award) & (shares.season == season)].sort_values("share", ascending=False)
            runner = [p for p in race.player if p != win_name]
            note = f"{runner[0]} finished second." if runner else ""
            add(cat, f"Who won {label} for the {season_text(season)} season?", win_name, pick_wrong(win_name, runner), note)

    # ---------- The draft: #1 picks (wrong answers: picks 2-4) ----------
    draft = pd.read_csv(STATS_DIR / "Draft Pick History.csv")
    draft = draft[(draft.lg == "NBA") & (draft["round"] == 1)]
    for year in range(1985, 2026):
        d = draft[draft.season == year].sort_values("overall_pick")
        if d.empty or d.iloc[0]["overall_pick"] != 1:
            continue
        first = d.iloc[0]
        tm = team_name.get((year + 1, first["tm"]), first["tm"])
        add("draft", f"Who was the #1 overall pick in the {year} draft?", first["player"], pick_wrong(first["player"], list(d.player[1:6])),
            f"The {tm} took him. {d.iloc[1]['player']} went second.")

    # ---------- The draft: where big stars were picked ----------
    curated_draft = {q[1] for q in CURATED if q[0] == "draft"}
    by_player = draft.drop_duplicates("player_id").set_index("player_id")
    big = [pid for pid in star_count[star_count >= 7].index if pid in by_player.index and by_player.at[pid, "season"] >= 1985]
    for pid in sorted(big, key=lambda p: -star_count[p])[:16]:
        row = by_player.loc[pid]
        q = f"At which pick was {row.player} drafted in {int(row.season)}?"
        if any(row.player in c for c in curated_draft):
            continue
        pick = int(row.overall_pick)
        add("draft", q, pick, [pick + 2, pick + 7, max(1, pick - 1) if pick > 1 else pick + 4],
            f"{team_name.get((int(row.season) + 1, row.tm), row.tm)} took him.")

    # ---------- Guess the college: modern All-Stars with one college ----------
    first_season = seasons_one.groupby("player_id")["season"].min()
    all_colleges = info["colleges"].dropna()
    popular = [c for c, _ in Counter(c.strip() for s in all_colleges for c in s.split(",")).most_common(45)]
    modern_stars = [pid for pid in star_count.index if first_season.get(pid, 0) >= 2004 and pid in info.index]
    for pid in sorted(modern_stars):
        col = info.at[pid, "colleges"]
        if not isinstance(col, str) or "," in col:
            continue
        col = col.strip()
        pool = [c for c in popular if c != col]
        R.shuffle(pool)
        add("college", f"Where did {nm(pid)} play college basketball?", col, pool[:3], f"{nm(pid)} made {star_count[pid]} All-Star team{'s' if star_count[pid] > 1 else ''}.")

    # ---------- Teammate guess ----------
    famous = set(star_count[star_count >= 3].index) & set(first_season[first_season >= 1980].index)
    latest_name = {}
    for (season, abbr), full_name in sorted(team_name.items()):
        latest_name[abbr] = full_name   # the name each abbreviation had most recently
    squads = defaultdict(set)   # (season, team) -> famous players
    for r in team_rows[team_rows.player_id.isin(famous)].itertuples():
        squads[(r.season, r.team)].add(r.player_id)
    all_squads = defaultdict(set)   # (season, team) -> everyone on the roster
    for r in team_rows[team_rows.season >= 1975].itertuples():
        all_squads[(r.season, r.team)].add(r.player_id)
    mates = defaultdict(set)
    shared = {}   # (a, b) -> (season, team) they shared, the earliest one
    for (season, team), players in sorted(squads.items()):
        for a in players:
            mates[a] |= players - {a}
            for b in players - {a}:
                shared.setdefault((a, b), (season, team))
    span = seasons_one.groupby("player_id")["season"].agg(["min", "max"])
    candidates = sorted(p for p in famous if mates[p])
    R.shuffle(candidates)
    for a in candidates[:45]:
        b = R.choice(sorted(mates[a]))
        lo, hi = span.loc[a, "min"], span.loc[a, "max"]
        era = [p for p in famous if p != a and p not in mates[a] and span.loc[p, "max"] >= lo and span.loc[p, "min"] <= hi]
        R.shuffle(era)
        season, team = shared[(a, b)]
        everyone = sorted({nm(p) for (s_, t_), ps in all_squads.items() if a in ps for p in ps if p != a})
        add("teammates", f"Name any player who was ever a teammate of {nm(a)}.", nm(b), [nm(p) for p in era[:3]] if len(era) >= 3 else None,
            f"One example: {nm(b)}, on the {team_name.get((season, team), team)} in {season_text(season)}. Any real teammate counts.",
            accept=("player", everyone))

    # ---------- Memorable stat lines: scoring titles and triple-double seasons ----------
    full = seasons_one[seasons_one.g >= 40]
    for season in range(1985, 2026):
        s = full[full.season == season].sort_values("pts_per_game", ascending=False)
        if s.empty:
            continue
        top = s.iloc[0]
        add("statlines", f"Who averaged {top.pts_per_game:.1f} points per game to lead the league in {season_text(season)}?",
            top.player, pick_wrong(top.player, list(s.player[1:6])), f"{top.player} also averaged {top.trb_per_game:.1f} rebounds and {top.ast_per_game:.1f} assists.")
    trip = full[(full.season >= 1980) & (full.pts_per_game >= 10) & (full.trb_per_game >= 10) & (full.ast_per_game >= 10)]
    for r in trip.itertuples():
        stars_then = full[(full.season == r.season)].sort_values("pts_per_game", ascending=False)
        add("statlines", f"Who averaged a triple-double of {r.pts_per_game:.1f} points, {r.trb_per_game:.1f} rebounds, and {r.ast_per_game:.1f} assists in {season_text(r.season)}?",
            r.player, pick_wrong(r.player, list(stars_then.player[:8])), "Averaging a triple-double for a whole season is incredibly rare.")
    for r in full[(full.season >= 1980) & (full.trb_per_game >= 16)].itertuples():
        bigs = full[full.season == r.season].sort_values("trb_per_game", ascending=False)
        add("statlines", f"Who averaged {r.trb_per_game:.1f} rebounds per game in {season_text(r.season)}?", r.player,
            pick_wrong(r.player, list(bigs.player[:6])), "Very few players have ever averaged 16 or more rebounds.")

    # ---------- Guess the player (clues from guess_player.json) ----------
    gp = json.load(open(OUT_DIR / "guess_player.json", encoding="utf-8"))["players"]
    last_season = seasons_one.groupby("player_id")["season"].max()
    pool = [p for p in gp if p["answer"]]
    R.shuffle(pool)
    POS = {"G": "guard", "F": "forward", "C": "center"}
    for p in pool[:45]:
        ft = f"{p['ht'] // 12}'{p['ht'] % 12}\""
        drafted = f"was drafted #{p['pick']}" if p["pick"] else "went undrafted"
        # Active players: their current team. Missed last season (injury): their most recent team.
        # Retired: the team they played the most games for.
        played = last_season.get(p["id"], 0)
        where = "plays for" if played == CURRENT else "last played for" if played == CURRENT - 1 else "is best known with"
        stars_txt = f"{p['allStars']} All-Star team{'s' if p['allStars'] != 1 else ''}" if p["allStars"] else "no All-Star teams"
        clue = f"A {ft} {POS.get(p['pos'][0], 'player')} who debuted in {p['debut'] - 1}, {drafted}, made {stars_txt}, and {where} the {latest_name.get(p['team'], p['team'])}. Who is he?"
        similar = [q["name"] for q in pool if q is not p and q["pos"][0] == p["pos"][0] and abs(q["debut"] - p["debut"]) <= 5]
        R.shuffle(similar)
        add("guess", clue, p["name"], similar[:3] if len(similar) >= 3 else None, f"{p['name']} made {stars_txt}.")

    # ---------- 2025-26 season (regular season) ----------
    tot = pd.read_csv(STATS_DIR / "Player Totals.csv")
    tot = tot[tot.lg == "NBA"].copy()
    tot["_summary"] = tot["team"].str.match(SUMMARY_TEAM).fillna(False)
    cur = tot[tot.season == CURRENT].sort_values("_summary", ascending=False).drop_duplicates("player_id")
    qual = cur[cur.g >= 65].copy()
    for col, label, unit in [("pts", "scoring", "points"), ("trb", "rebounding", "rebounds"), ("ast", "assists", "assists"),
                             ("stl", "steals", "steals"), ("blk", "blocks", "blocks")]:
        qual["_pg"] = qual[col] / qual.g
        s = qual.sort_values("_pg", ascending=False)
        top = s.iloc[0]
        add("season", f"Who led the NBA in {label} (per game) in the 2025-26 regular season?", top.player,
            pick_wrong(top.player, list(s.player[1:5])), f"{top.player} averaged {top._pg:.1f} {unit} per game.")
    s = cur.sort_values("x3p", ascending=False)
    add("season", "Who made the most three-pointers in the 2025-26 regular season?", s.iloc[0].player,
        pick_wrong(s.iloc[0].player, list(s.player[1:5])), f"{s.iloc[0].player} made {int(s.iloc[0].x3p)}.")
    t26 = teams[teams.season == CURRENT].sort_values("w", ascending=False)
    best, worst = t26.iloc[0], t26.iloc[-1]
    add("season", "Which team had the best record in the 2025-26 regular season?", best.team, list(t26.team[1:4]), f"They went {int(best.w)}-{int(best.l)}.")
    add("season", "Which team had the worst record in the 2025-26 regular season?", worst.team, list(t26.team[-4:-1]), f"They went {int(worst.w)}-{int(worst.l)}.")
    add("season", f"How many games did the {best.team} win in the 2025-26 regular season?", int(best.w),
        [int(best.w) - 3, int(best.w) + 2, int(best.w) - 6], f"They finished {int(best.w)}-{int(best.l)}.")
    for conf, members in [("East", t26[t26.abbreviation.isin(EAST)]), ("West", t26[~t26.abbreviation.isin(EAST)])]:
        for seed in (1, 2):
            if members.iloc[seed - 1].w == members.iloc[seed].w or (seed == 2 and members.iloc[0].w == members.iloc[1].w):
                continue   # tied records: seeding came down to tiebreakers, so skip it
            team = members.iloc[seed - 1]
            add("season", f"Which team finished with the #{seed} record in the {conf} in 2025-26?", team.team,
                [t for t in members.team if t != team.team][:3], f"They went {int(team.w)}-{int(team.l)}.")
    for r in t26.itertuples():
        roster = pg[(pg.season == CURRENT) & (pg.team == r.abbreviation) & (pg.g >= 30)].sort_values("pts_per_game", ascending=False)
        if len(roster) < 4:
            continue
        lead = roster.iloc[0]
        add("season", f"Who led the {r.team} in scoring (per game) in 2025-26?", lead.player, list(roster.player[1:4]),
            f"{lead.player} averaged {lead.pts_per_game:.1f} points for them.")

    # ---------- Records: career leaders ----------
    career = tot.sort_values("_summary", ascending=False).drop_duplicates(["player_id", "season"]).groupby(["player_id", "player"])[
        ["pts", "trb", "ast", "stl", "blk", "x3p", "g", "trp_dbl"]].sum().reset_index()
    for col, label in [("pts", "points"), ("trb", "rebounds"), ("ast", "assists"), ("stl", "steals"), ("blk", "blocks"),
                       ("x3p", "three-pointers made"), ("g", "games played"), ("trp_dbl", "triple-doubles")]:
        s = career.sort_values(col, ascending=False)
        add("records", f"Who is the NBA's all-time leader in career {label}?", s.iloc[0].player, pick_wrong(s.iloc[0].player, list(s.player[1:5])),
            f"{s.iloc[0].player}: {int(s.iloc[0][col]):,}. {s.iloc[1].player} is second.")
        if col in ("pts", "trb", "ast"):
            add("records", f"Who is second all-time in career {label}?", s.iloc[1].player,
                pick_wrong(s.iloc[1].player, [s.iloc[0].player] + list(s.player[2:5])), f"{s.iloc[0].player} is first.")
    sc = star_count.sort_values(ascending=False)
    add("records", "Who has been selected to the most All-Star Games?", nm(sc.index[0]), [nm(p) for p in sc.index[1:4]],
        f"{nm(sc.index[0])} has {sc.iloc[0]} selections.")

    # ---------- how each answer is judged ----------
    player_names = set(info["player"])
    full_team_names = set(teams.team)
    abbrs = defaultdict(set)
    for r in teams.itertuples():
        abbrs[r.team].add(r.abbreviation)

    def team_forms(full):
        nick = "Trail Blazers" if full.endswith("Trail Blazers") else full.split()[-1]
        city = full[: -len(nick)].strip()
        forms = [full, nick] + TEAM_SLANG.get(nick, []) + sorted(abbrs[full])
        if city and city != "Los Angeles":
            forms.append(city)
        return forms

    def player_forms(name):
        return [name] + PLAYER_ALIASES.get(name, [])

    def judge(cat, answer, accept):
        if accept:
            return accept
        if answer in ACCEPT:
            spec = ACCEPT[answer]
            return ("all", spec["all"]) if isinstance(spec, dict) else ("text", spec)
        if cat == "year":
            return ("year", [answer])
        if re.fullmatch(r"\d+", answer):
            return ("num", [answer])
        if answer in full_team_names:
            return ("team", team_forms(answer))
        if cat == "college":
            return ("text", [answer] + COLLEGE_ALIASES.get(answer, []))
        if answer in player_names or answer in PLAYER_ALIASES or cat == "coaches":
            return ("player", player_forms(answer))
        return ("text", [answer])

    rows = []
    for cat, q, answer, accept, note in qs:
        kind, forms = judge(cat, answer, accept)
        rows.append([cat, q, answer, kind, forms, note])

    # ---------- write ----------
    seen, unique = set(), []
    for q in rows:
        if q[1] not in seen:
            seen.add(q[1]); unique.append(q)
    path = OUT_DIR / "trivia.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"cats": CATS, "questions": unique}, f, separators=(",", ":"), ensure_ascii=False)
    per = Counter(q[0] for q in unique)
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB): {len(unique)} questions")
    for cid, name in CATS:
        print(f"  {name:32} {per[cid]}")


if __name__ == "__main__":
    main()
