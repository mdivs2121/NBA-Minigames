"""
current_teams.py - each player's team for the 2026-27 season, where the stats
don't show it yet.

The stats data ends with the 2025-26 regular season, so offseason trades and
signings aren't in it. These come from the 2026 offseason moves list the site
owner pasted in October 2026 (additions and re-signings by team; departures
with a named destination when no addition lists the player). Names are as
written there; build_guess_player.py matches them to player ids.

To update: change a player's team here and rerun build_guess_player.py and
build_trivia.py.
"""

MOVES_2026 = {
    "ATL": ["Luguentz Dort", "Dorian Finney-Smith", "Aaron Wiggins", "Jock Landale", "CJ McCollum", "Devin Carter"],
    "BOS": ["Mike Conley", "Paul George", "Mitchell Robinson", "Ron Harper Jr.", "Payton Pritchard", "Neemias Queta", "Jordan Walsh"],
    "BRK": ["Keon Ellis", "Julius Randle", "Moritz Wagner", "Josh Minott", "Day'Ron Sharpe"],
    "CHO": ["Grayson Allen", "Royce O'Neale", "Naz Reid", "Dennis Schröder", "Coby White", "Rob Dillingham", "Mouhamadou Gueye", "Ryan Nembhard"],
    "CHI": ["Nic Claxton", "Buddy Hield", "Norman Powell", "Zach Collins", "Kam Jones"],
    "CLE": ["Khalifa Diop", "Mario Hezonja", "Peyton Watson", "Thomas Bryant", "James Harden", "Donovan Mitchell", "Cam Whitmore"],
    "DAL": ["Santi Aldama", "Tarik Biberović", "Zaccharie Risacher", "Marcus Sasser", "Moussa Cissé", "Naji Marshall"],
    "DEN": ["Marvin Bagley III", "DeMar DeRozan", "Alpha Diallo", "Tyus Jones", "Spencer Jones"],
    "DET": ["John Collins", "Isaiah Joe", "Taurean Prince", "Jalen Duren", "Javonte Green", "Kevin Huerter", "Ausar Thompson", "Gary Harris"],
    "GSW": ["Georges Niang", "Brandon Williams", "Charles Bassey", "Stephen Curry", "Draymond Green", "Al Horford", "De'Anthony Melton",
            "Gary Payton II", "Brandin Podziemski", "Kristaps Porziņģis"],
    "HOU": ["Bogdan Bogdanović", "Marcus Smart", "Isaiah Crawford", "Tari Eason", "Jae'Sean Tate", "Amen Thompson"],
    "IND": ["Larry Nance Jr.", "Kelly Oubre Jr."],
    "LAC": ["Johni Broome", "Gradey Dick", "Rui Hachimura", "Brandon Ingram", "Max Strus", "Bradley Beal", "Jordan Miller", "Kobe Sanders"],
    "LAL": ["Quentin Grimes", "Jaden Hardy", "Walker Kessler", "Kevon Looney", "Sandro Mamukelashvili", "Collin Sexton", "Matisse Thybulle",
            "Ziaire Williams", "Austin Reaves"],
    "MEM": ["Jerami Grant", "Kris Murray", "Micah Peavy", "Quinten Post", "Isaiah Stewart", "Jordan Hawkins", "D'Angelo Russell"],
    "MIA": ["Giannis Antetokounmpo", "Tim Hardaway Jr.", "Bobby Portis", "Nick Richards", "Klay Thompson", "Simone Fontecchio",
            "Pelle Larsson", "Andrew Wiggins"],
    "MIL": ["Tyler Herro", "Kasparas Jakučionis", "Jaime Jaquez Jr.", "Caris LeVert", "Kel'el Ware", "Ousmane Dieng", "Bogoljub Marković",
            "Pete Nance", "Gary Trent Jr."],
    "MIN": ["LaMelo Ball", "Jonathan Kuminga", "Trey Lyles", "Cody Williams", "Jaylen Clark", "Ayo Dosunmu", "Bones Hyland"],
    "NOP": ["AJ Johnson", "Bennedict Mathurin", "Trendon Watford", "Saddiq Bey", "DeAndre Jordan", "Taj Gibson"],
    "NYK": ["Andre Drummond", "Jose Alvarado", "Jordan Clarkson", "Mohamed Diawara", "Landry Shamet"],
    "OKC": ["Isaiah Hartenstein", "Cason Wallace", "Kenrich Williams"],
    "ORL": ["Nikola Vučević", "Jevon Carter", "Jonathan Isaac"],
    "PHI": ["Jaylen Brown", "Kentavious Caldwell-Pope", "Ariel Hukporti", "LeBron James", "Anfernee Simons", "Dean Wade"],
    "PHO": ["Miles Bridges", "Luke Kennard", "Dillon Brooks", "Collin Gillespie", "Jordan Goodwin", "Haywood Highsmith", "Oso Ighodaro", "Mark Williams"],
    "POR": ["Branden Carlson", "Ja Morant", "Micah Potter", "Jeremy Sochan", "Robert Williams III"],
    "SAC": ["Ben Simmons", "Precious Achiuwa", "Daeqwon Plowden"],
    "SAS": ["Tobias Harris", "Harrison Barnes", "Julian Champagnie", "Jordan McLaughlin", "Victor Wembanyama"],
    "TOR": ["Kyle Anderson", "Kawhi Leonard", "Alijah Martin", "Jamal Shead"],
    "UTA": ["Tony Bradley", "Josh Green", "Jaxson Hayes", "Josh Okogie", "Mo Bamba", "Keyonte George", "Jusuf Nurkić"],
    "WAS": ["Deandre Ayton", "Tre Mann", "Khris Middleton", "Anthony Gill", "Trae Young"],
}

# Players who changed teams without playing since, from before the list above.
EARLIER_MOVES = {
    "Damian Lillard": "POR",   # waived by Milwaukee, re-signed with Portland in July 2025 (Achilles, out 2025-26)
}

CURRENT_TEAM = {name: team for team, names in MOVES_2026.items() for name in names}
CURRENT_TEAM.update({k: v for k, v in EARLIER_MOVES.items() if k not in CURRENT_TEAM})
