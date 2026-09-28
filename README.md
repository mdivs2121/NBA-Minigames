# NBA Minigames

A home page and five browser games built on NBA stats, 2005-06 to 2025-26 (and further back for Draft Redo and Snake Draft):

- **Teammate Chain**: link two players through teammates in as few guesses as you can.
- **Rank the Five**: a daily puzzle. Rank five players by a hidden stat.
- **Higher or Lower**: does the next player have more or fewer? Keep the streak going.
- **Draft Redo**: re-draft a whole class (1989–2021), scored on career Win Shares.
- **Snake Draft**: draft single player-seasons against a computer GM.

Plain HTML, CSS, and JavaScript, no build step. The JSON in `data/` is made by Python
scripts from the Kaggle dataset "NBA Stats (1947-present)".

To run locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
