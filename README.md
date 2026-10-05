# NBA Minigames

A growing collection of browser games built on NBA stats, 2005-06 to 2025-26 (and further back for Draft Redo and Snake Draft). The home page lists every game. Games so far:

- **Teammate Chain**: link two players through teammates in as few guesses as you can.
- **Rank the Five**: a daily puzzle. Rank five players by a hidden stat.
- **Higher or Lower**: does the next player have more or fewer? Keep the streak going.
- **Career Path**: name the player from his team history; misses unlock clues.
- **Hindsight → Name the Team → Full Roster**: name as many players from a team-season as you can in 60 seconds.
- **Blind Draft**: draft a starting five from anonymous stat lines; hidden Win Shares score it.
- **Draft Day**: given a draft year and pick number, name who was taken.
- **Stat Line**: name the player from one real season's stat line; misses unlock clues.
- **Timeline**: put five moments from NBA history in order; three lives.
- **Awards Grid** (daily): a 3×3 grid of teams, awards, and milestones; name a player for every square.
- **Guess the Player** (daily): a mystery player; every guess shows if you're warmer on team, position, height, debut, draft pick, and All-Stars.
- **Blind Résumé**: two anonymous stat lines (careers, single seasons, or teams); pick the better one.
- **Hoop Connections**: a daily puzzle. Sort 16 players into 4 hidden groups.
- **Hindsight**: three tabs. Draft Redo re-drafts a class (1989–2021) by career Win Shares; MVP Ballot re-orders a season's MVP vote; Name the Team fills in an All-NBA, All-Defense, or All-Rookie team.
- **Snake Draft**: draft single player-seasons against a computer GM.
- **Players**: a page for every player since 1979-80, with bio, honors, and season stats.

Plain HTML, CSS, and JavaScript, no build step. The JSON in `data/` is made by the
Python scripts in [`scripts/`](scripts/) from the Kaggle dataset "NBA Stats (1947-present)";
see that folder's README to rebuild it.

To run locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
