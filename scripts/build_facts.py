"""
build_facts.py - "Did you know?" facts for the home page.

Reads the JSON the other scripts already wrote to data/ (no CSVs needed) and
writes data/facts.json: [ { "id": playerId, "name": "...", "text": "..." }, ... ].
Each fact is about one player, so the home page can show his photo and link
to his page.

Run after the other build scripts:  python3 build_facts.py
"""
import json
from collections import Counter

from paths import OUT_DIR


def load(name):
    return json.load(open(OUT_DIR / f"{name}.json", encoding="utf-8"))


def nth(n):
    """1 -> 1st, 2 -> 2nd, 11 -> 11th, 22 -> 22nd"""
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def most(n):
    """1 -> 'the most', 2 -> 'the 2nd-most'"""
    return "the most" if n == 1 else f"the {nth(n)}-most"


def main():
    facts = []
    add = lambda pid, text: facts.append({"id": pid, "text": text})

    # Draft steals: late picks who finished near the top of their class.
    draft = load("draft")
    for year, picks in draft.items():
        best = sorted(picks, key=lambda p: -p["ws"])[:3]
        for rank, p in enumerate(best, 1):
            if p["pick"] >= 11 and p["ws"] >= 40:
                add(p["id"], f"{p['name']} went #{p['pick']} in the {year} draft, but his {p['ws']:.0f} career "
                             f"Win Shares are {most(rank)} in his class.")

    # MVP races: unanimous winners, photo finishes, and near-misses.
    for season, race in load("mvp").items():
        win, second = race[0], race[1]
        if win["share"] == 1:
            add(win["id"], f"{win['name']}'s {season} MVP was unanimous: every first-place vote.")
        if win["points"] - second["points"] <= 0.06 * win["points"]:
            add(second["id"], f"{second['name']} lost the {season} MVP race to {win['name']} by just "
                              f"{win['points'] - second['points']} voting points.")
        if second["share"] >= 0.75:
            add(second["id"], f"{second['name']} got {second['share'] * 100:.0f}% of the MVP vote in {season} "
                              f"and still finished second, behind {win['name']}.")

    # The best single seasons since 1979-80, by Win Shares.
    seasons = sorted(load("snake"), key=lambda s: -s["ws"])
    seen = Counter()
    for rank, s in enumerate(seasons[:40], 1):
        seen[s["id"]] += 1
        if seen[s["id"]] > 2:
            continue   # don't let one player take over the list
        best = "the best" if rank == 1 else f"the {nth(rank)}-best"
        add(s["id"], f"{s['name']}'s {s['season']} season was worth {s['ws']} Win Shares, {best} "
                     f"of anyone since 1979-80.")
    for s in [s for s in seasons if s["ws"] < 4 and s["ppg"] >= 23][:8]:
        add(s["id"], f"{s['name']} scored {s['ppg']} a game in {s['season']} but added only {s['ws']} Win Shares.")

    # Career leaders among everyone who played from 2005-06 on.
    players = load("players")
    stats = load("rank_stats")
    careers = {pid: s["career"] for pid, s in stats.items() if s.get("career")}
    boards = [
        ("trpDbl", "career triple-doubles", 5),
        ("x3p", "career 3-pointers", 5),
        ("pts", "career points", 5),
        ("g", "career games", 3),
        ("blk", "career blocks", 3),
        ("stl", "career steals", 3),
        ("seasons", "NBA seasons", 3),
    ]
    for stat, words, top in boards:
        ranked = sorted((p for p in careers if careers[p].get(stat)), key=lambda p: -careers[p][stat])[:top]
        for rank, pid in enumerate(ranked, 1):
            n = careers[pid][stat]
            add(pid, f"{players[pid]['name']}: {n:,} {words}, {most(rank)} of anyone who played from 2005-06 on.")

    # Most teammates since 2005-06 (from the Teammate Chain graph).
    graph = load("teammate_graph")
    for rank, pid in enumerate(sorted(graph, key=lambda p: -len(graph[p]))[:5], 1):
        where = "more than anyone else since 2005-06" if rank == 1 else f"{most(rank)} since 2005-06"
        add(pid, f"{players[pid]['name']} has played with {len(graph[pid])} different teammates, {where}.")

    # Journeymen and one-team lifers (from the Connections explanations).
    cx = load("connections")
    names = cx["players"]
    for c in cx["categories"]:
        if c["label"] == "Played for 7+ franchises":
            top = sorted(c["details"].items(), key=lambda kv: -int(kv[1].split()[0]))[:6]
            for pid, why in top:
                add(pid, f"{names[pid]} suited up for {why}.")
        if c["label"] == "Spent 10+ seasons with only one franchise":
            top = sorted(c["details"].items(), key=lambda kv: -int(kv[1].split(", ")[1].split()[0]))[:6]
            for pid, why in top:
                team, count = why.split(", ")
                add(pid, f"{names[pid]} played {count} and every one of them for the {team}.")

    # Names for every player a fact is about, from whichever file has him.
    names_all = {pid: p["name"] for pid, p in players.items()}
    names_all.update(cx["players"])
    for picks in draft.values():
        for p in picks:
            names_all.setdefault(p["id"], p["name"])
    for s in seasons:
        names_all.setdefault(s["id"], s["name"])
    for race in load("mvp").values():
        for p in race:
            names_all.setdefault(p["id"], p["name"])
    facts = [{"id": f["id"], "name": names_all[f["id"]], "text": f["text"]} for f in facts]

    path = OUT_DIR / "facts.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(facts, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path}: {len(facts)} facts")
    for fact in facts[:: max(1, len(facts) // 8)]:
        print("  -", fact["text"])


if __name__ == "__main__":
    main()
