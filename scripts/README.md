# Data build scripts

These Python scripts turn the Kaggle CSVs into the JSON files in `../data/`
that the website loads. Run them after downloading new data; the site itself
needs no Python.

## Setup

1. `python3 -m pip install pandas nba_api`
2. Download the Kaggle dataset **"NBA Stats (1947-present)"** by Sumitro Datta and
   put its folder at `scripts/Stats Folder/` (or set `NBA_STATS_DIR` to wherever it is).
3. Optional, for `build_photos.py` only: the older Kaggle **"NBA Database"**
   (wyattowalsh/basketball), unzipped at `scripts/archive/` (or set `NBA_ARCHIVE_DIR`).
   It's used only to tell apart players who share a name.

The CSVs aren't in the repo; they're large and not ours to redistribute.

## Run

From this folder, in this order (later scripts read earlier output):

```bash
python3 build_data.py              # players, seasons, rosters, teammate graph
python3 build_chain_data.py        # compact data for Teammate Chain
python3 build_photos.py            # NBA.com headshot IDs (checks every photo; ~2 min)
python3 build_rank_data.py         # Rank the Five, Higher or Lower
python3 build_draft_data.py        # Draft Redo
python3 build_snake_data.py        # Snake Draft
python3 build_mvp_data.py          # MVP Ballot
python3 build_season_teams.py      # Name the Team (All-NBA, All-Defense, All-Rookie)
python3 build_connections_data.py  # Hoop Connections
python3 build_player_pages.py      # player pages
python3 build_career_path.py       # Career Path (reads connections.json)
python3 build_guess_player.py      # Guess the Player (reads connections.json)
python3 build_awards_grid.py       # Awards Grid
python3 build_timeline.py          # Timeline (after build_awards_grid.py)
python3 build_rosters.py           # Full Roster tab of Name the Team
python3 build_stat_lines.py        # Stat Line (after build_player_pages.py)
python3 build_blind_draft.py       # Blind Draft (after build_player_pages.py)
python3 build_draft_day.py         # Draft Day (after build_player_pages.py)
python3 build_college_connect.py   # College Connect (after build_awards_grid.py)
python3 build_blind_resume.py      # Blind Résumé (Careers, Seasons, and Teams modes)
python3 build_facts.py             # "Did you know?" facts (reads the files above)
```

Each script writes straight into `../data/`. Commit and push, and the live site
updates. Heads-up: new data changes which daily puzzles people get.

## Publishing

Before committing a change to the site, run `python3 scripts/stamp_version.py`.
It tags every script and stylesheet link with a new version so visitors get the
new code right away instead of an old copy their browser saved.
