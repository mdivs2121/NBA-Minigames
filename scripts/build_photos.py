"""
build_photos.py - match each game player to his NBA.com ID for headshots.

Reads data/players.json and player_seasons.json (from build_data.py) and
writes data/photos.json: { playerId: nbaId }. The site turns an nbaId into
https://cdn.nba.com/headshots/nba/latest/260x190/<nbaId>.png

Needs:  python3 -m pip install nba_api   (also installs requests)
Run:    python3 build_photos.py
"""
import json
import re
import unicodedata
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
from paths import ARCHIVE_DIR, OUT_DIR
import requests
from nba_api.stats.static import players as nba_players

HEADSHOT_URL = "https://cdn.nba.com/headshots/nba/latest/260x190/{}.png"
HEADERS = {"User-Agent": "Mozilla/5.0"}

# Optional: NBA.com first/last seasons, used only to tell apart players with the same name.
CAREER_FILE = ARCHIVE_DIR / "csv" / "common_player_info.csv"

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}

# Letters that don't break down into plain a-z on their own.
SPECIAL_LETTERS = str.maketrans({"ı": "i", "ё": "e", "ß": "ss", "ø": "o", "ł": "l", "đ": "d"})

# Players whose name is spelled differently on NBA.com: playerId -> NBA.com name.
# Add to this if the unmatched list printed at the end has someone you care about.
ALIASES = {
    "reynoca01": "Cam Reynolds",
    "cuiyo01": "Cui Cui",
    "hurtma01": "Matt Hurt",
    "sweetmi01": "Michael Sweetney",
    "creekmi01": "Mitchell Creek",
    "nembhrj01": "Ruben Nembhard Jr.",
    "hollaro01": "Ronald Holland II",
    "murraro01": "Flip Murray",
    "medvest01": "Slava Medvedenko",
    "scotttr01": "Trevon Scott",
    "edwarvi01": "Vincent Edwards",
    "huntevi01": "Vincent Hunter",
    "favervi01": "Vitor Faverani",
    "tayloje03": "Jeffery Taylor",
}

# Hand-checked matches the name rules can't work out: playerId -> NBA.com ID.
OVERRIDES = {
    "ewingpa02": 201607,  # Patrick Ewing Jr., not his dad
}


def words(name: str) -> list:
    """'Luka Dončić' -> ['luka', 'doncic']"""
    name = name.lower().translate(SPECIAL_LETTERS)
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return [w for w in re.split(r"[\s\-]+", name.replace(".", "").replace("'", "")) if w]


def norm(name: str) -> str:
    """'Gary Trent Jr.' -> 'garytrentjr'"""
    return "".join(words(name))


def norm_no_suffix(name: str) -> str:
    """'Gary Trent Jr.' -> 'garytrent' (fallback when suffixes don't line up)"""
    return "".join(w for w in words(name) if w not in SUFFIXES)


def has_real_photo(nba_id: int) -> bool:
    """NBA.com serves a gray silhouette (always the same bytes) when it has no photo."""
    try:
        r = requests.get(HEADSHOT_URL.format(nba_id), headers=HEADERS, timeout=15)
        return r.ok and r.content != SILHOUETTE
    except requests.RequestException:
        return False


SILHOUETTE = b""


def main():
    global SILHOUETTE
    players = json.load(open(OUT_DIR / "players.json", encoding="utf-8"))
    seasons = json.load(open(OUT_DIR / "player_seasons.json", encoding="utf-8"))

    # Each game player's first and last season start year, e.g. 2005 for 2005-06.
    span = {}
    for s in seasons:
        year = int(s["season"][:4])
        lo, hi = span.get(s["playerId"], (year, year))
        span[s["playerId"]] = (min(lo, year), max(hi, year))

    by_name, by_name_loose = {}, {}
    for p in nba_players.get_players():
        by_name.setdefault(norm(p["full_name"]), []).append(p["id"])
        by_name_loose.setdefault(norm_no_suffix(p["full_name"]), []).append(p["id"])

    nba_span = {}
    if CAREER_FILE.exists():
        info = pd.read_csv(CAREER_FILE, usecols=["person_id", "from_year", "to_year"]).dropna()
        nba_span = {int(r.person_id): (int(r.from_year), int(r.to_year)) for r in info.itertuples()}

    photos, unmatched, ambiguous = {}, [], []
    for pid, info in players.items():
        if pid in OVERRIDES:
            photos[pid] = OVERRIDES[pid]
            continue
        name = ALIASES.get(pid, info["name"])
        ids = by_name.get(norm(name)) or by_name_loose.get(norm_no_suffix(name), [])
        # Drop same-name players from other eras: anyone whose NBA.com career
        # doesn't overlap this one (1 season of slack), and the 76000-79999 IDs
        # NBA.com uses for players who retired long before 2005.
        lo, hi = span[pid]
        ids = [
            i for i in ids
            if not 76000 <= i < 80000
            and (i not in nba_span or (nba_span[i][0] <= hi + 1 and nba_span[i][1] >= lo - 1))
        ]
        if len(ids) > 1:
            ambiguous.append(info["name"])
            continue
        if not ids:
            unmatched.append(info["name"])
            continue
        photos[pid] = ids[0]

    # Two game players matched to one NBA.com player means we can't tell them apart.
    counts = Counter(photos.values())
    for pid in [p for p, i in photos.items() if counts[i] > 1]:
        ambiguous.append(players[pid]["name"])
        del photos[pid]

    # Keep only players NBA.com has a real headshot for (ID 0 is never a player).
    SILHOUETTE = requests.get(HEADSHOT_URL.format(0), headers=HEADERS, timeout=15).content
    print(f"checking {len(photos)} headshots on NBA.com...")
    with ThreadPoolExecutor(max_workers=24) as pool:
        real = dict(zip(photos, pool.map(has_real_photo, photos.values())))
    no_photo = sorted(players[p]["name"] for p, ok in real.items() if not ok)
    photos = {p: i for p, i in photos.items() if real[p]}

    path = OUT_DIR / "photos.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(photos, f, separators=(",", ":"))
    print(f"wrote {path}")
    print(f"{len(photos)} of {len(players)} players have a headshot")
    if ambiguous:
        print(f"{len(ambiguous)} same-name players left out: {', '.join(sorted(ambiguous))}")
    if unmatched:
        print(f"{len(unmatched)} not found on NBA.com: {', '.join(sorted(unmatched))}")
    if no_photo:
        print(f"{len(no_photo)} matched but NBA.com has no headshot (they'll show initials)")


if __name__ == "__main__":
    main()
