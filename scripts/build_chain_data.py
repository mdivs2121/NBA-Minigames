"""
build_chain_data.py - a compact single file for Teammate Chain.

Reads teammate_graph.json and player_seasons.json (from build_data.py) and
writes data/chain.json with the same information in far fewer bytes:

  { "ids":     [playerId, ...],                    # position = the player's number
    "graph":   [[teammate numbers, as gaps], ...], # sorted, each as the gap from the last
    "seasons": [[[season, "LAL/MIA", g, ppg, rpg, apg], ...], ...] }

Teammates are stored as gaps between sorted numbers (5, 9, 12 -> 5, 4, 3)
because small repeated numbers compress much better. Only the stats the
game shows are kept.

Run after build_data.py:  python3 build_chain_data.py
"""
import gzip
import json

from paths import OUT_DIR


def main():
    graph = json.load(open(OUT_DIR / "teammate_graph.json", encoding="utf-8"))
    seasons = json.load(open(OUT_DIR / "player_seasons.json", encoding="utf-8"))

    ids = sorted(graph)
    number = {pid: i for i, pid in enumerate(ids)}

    gaps = []
    for pid in ids:
        mates = sorted(number[m] for m in graph[pid])
        gaps.append([m - prev for m, prev in zip(mates, [0] + mates)])

    by_player = {pid: [] for pid in ids}
    for s in sorted(seasons, key=lambda s: s["season"]):
        if s["playerId"] in by_player:
            st = s["stats"]
            by_player[s["playerId"]].append([
                s["season"], "/".join(s["teams"]),
                None if st["games"] is None else int(st["games"]), st["ppg"], st["rpg"], st["apg"],
            ])

    out = {"ids": ids, "graph": gaps, "seasons": [by_player[pid] for pid in ids]}
    path = OUT_DIR / "chain.json"
    text = json.dumps(out, separators=(",", ":"), ensure_ascii=False)
    path.write_text(text, encoding="utf-8")

    old = sum((OUT_DIR / f).stat().st_size for f in ["teammate_graph.json", "player_seasons.json"])
    old_gz = sum(len(gzip.compress((OUT_DIR / f).read_bytes())) for f in ["teammate_graph.json", "player_seasons.json"])
    print(f"wrote {path}: {len(text) / 1024:.0f} KB ({len(gzip.compress(text.encode())) / 1024:.0f} KB compressed), "
          f"was {old / 1024:.0f} KB ({old_gz / 1024:.0f} KB compressed)")


if __name__ == "__main__":
    main()
