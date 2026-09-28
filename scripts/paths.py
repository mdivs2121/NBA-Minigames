"""
Where the build scripts read from and write to.

The Kaggle CSVs ("NBA Stats (1947-present)" by Sumitro Datta) aren't in the
repo. Put that dataset's folder at scripts/Stats Folder, or point the
NBA_STATS_DIR environment variable at it. Scripts write straight into the
website's data/ folder.
"""
import os
from pathlib import Path

SCRIPTS = Path(__file__).parent
STATS_DIR = Path(os.environ.get("NBA_STATS_DIR", SCRIPTS / "Stats Folder"))
OUT_DIR = SCRIPTS.parent / "data"

# Optional: the older "NBA Database" Kaggle dataset (wyattowalsh/basketball).
# build_photos.py uses its career years only to tell same-name players apart.
ARCHIVE_DIR = Path(os.environ.get("NBA_ARCHIVE_DIR", SCRIPTS / "archive"))
