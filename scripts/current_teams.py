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


# ---------- 2026-27 uniform numbers (and teams) ----------
# The uniform list covers every player on a roster this season, so where it
# and MOVES_2026 disagree, the uniform list (newer, per player) wins.

def _read_uniforms():
    from pathlib import Path
    numbers, current = {}, None
    for line in (Path(__file__).with_name("uniform_numbers_2026_27.txt")).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.isdigit():
            current = line
            continue
        name, team = line.rsplit(" ", 1)
        numbers[name] = (current, team)
    return numbers

UNIFORMS = _read_uniforms()   # name -> (number as written, e.g. "00", team)
CONFLICTS = {n: (CURRENT_TEAM[n], t) for n, (_, t) in UNIFORMS.items() if n in CURRENT_TEAM and CURRENT_TEAM[n] != t}
CURRENT_TEAM.update({n: t for n, (_, t) in UNIFORMS.items()})


# ---------- well-known numbers the data doesn't have ----------
# Retired stars, with the team each one is best known with (the team Guess the
# Player shows). Only used when that team matches. Numbers anyone would check
# against a jersey; no guesses for players with two famous numbers there.
KNOWN_NUMBERS = {
    "Allen Iverson": ("3", "PHI"), "Carmelo Anthony": ("15", "DEN"), "Chris Bosh": ("4", "TOR"), "Ray Allen": ("34", "MIL"),
    "Dwight Howard": ("12", "ORL"), "Tracy McGrady": ("1", "HOU"), "Jason Kidd": ("5", "NJN"), "Joe Johnson": ("2", "ATL"),
    "Blake Griffin": ("32", "LAC"), "LaMarcus Aldridge": ("12", "POR"), "Chris Webber": ("4", "SAC"), "Pau Gasol": ("16", "MEM"),
    "John Wall": ("2", "WAS"), "DeMarcus Cousins": ("15", "SAC"), "Derrick Rose": ("1", "CHI"), "Kemba Walker": ("15", "CHO"),
    "Chauncey Billups": ("1", "DET"), "Anfernee Hardaway": ("1", "ORL"), "Antawn Jamison": ("4", "WAS"), "Rasheed Wallace": ("30", "POR"),
    "Marc Gasol": ("33", "MEM"), "Paul Millsap": ("24", "UTA"), "Victor Oladipo": ("5", "ORL"), "Lou Williams": ("23", "PHI"),
    "Baron Davis": ("1", "CHH"), "Rashard Lewis": ("7", "SEA"), "Rajon Rondo": ("9", "BOS"), "Jamal Crawford": ("11", "LAC"),
    "Caron Butler": ("3", "WAS"), "Goran Dragić": ("7", "MIA"), "Luol Deng": ("9", "CHI"), "Gordon Hayward": ("20", "UTA"),
    "Zydrunas Ilgauskas": ("11", "CLE"), "Josh Howard": ("5", "DAL"), "Sam Cassell": ("10", "MIL"), "Joakim Noah": ("13", "CHI"),
    "Tyreke Evans": ("13", "SAC"), "Al Jefferson": ("25", "UTA"), "Andre Iguodala": ("9", "PHI"), "Chris Paul": ("3", "LAC"),
    "Eddie Jones": ("6", "MIA"), "Juwan Howard": ("5", "WAS"),
}
