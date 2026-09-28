# NBA Minigames

A growing collection of browser games built on NBA stats, 2005-06 to 2025-26 (and further back for Draft Redo and Snake Draft). The home page lists every game. Games so far:

- **Teammate Chain**: link two players through teammates in as few guesses as you can.
- **Rank the Five**: a daily puzzle. Rank five players by a hidden stat.
- **Higher or Lower**: does the next player have more or fewer? Keep the streak going.
- **Draft Redo**: re-draft a whole class (1989–2021), scored on career Win Shares.
- **Hoop Connections**: a daily puzzle. Sort 16 players into 4 hidden groups.
- **MVP Ballot**: put a season's top five MVP vote-getters in voting order.
- **Snake Draft**: draft single player-seasons against a computer GM.
- **Players**: a page for every player since 1979-80, with bio, honors, and season stats.

Plain HTML, CSS, and JavaScript, no build step. The JSON in `data/` is made by the
Python scripts in [`scripts/`](scripts/) from the Kaggle dataset "NBA Stats (1947-present)";
see that folder's README to rebuild it.

To run locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
