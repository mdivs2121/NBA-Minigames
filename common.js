// Shared by every minigame: player names, headshots, and small helpers.
// Each game's own script loads after this one and adds to `data`.

const data = {
  players: {},      // playerId -> { name }
  photos: {},       // playerId -> NBA.com ID, for players with an NBA headshot
};

const $ = (id) => document.getElementById(id);

async function fetchJson(file) {
  const r = await fetch(`data/${file}.json`);
  if (!r.ok) throw new Error(`${file}.json: ${r.status}`);
  return r.json();
}

async function loadCommon() {
  const [players, photos] = await Promise.all([
    fetchJson("players"),
    // Photos are optional: without photos.json everyone just gets initials.
    fetchJson("photos").catch(() => ({})),
  ]);
  data.players = players;
  data.photos = photos;
  if (MODERN) data.modern = new Set((await fetchJson("modern")).ids);
}

function name(id) {
  return data.players[id].name;
}

// Headshot over the player's initials: NBA.com when build_photos.py found one,
// otherwise Basketball-Reference (same IDs as our data). If neither has a
// photo, the image fails to load and the initials show instead.
function photoUrl(id) {
  const nbaId = data.photos[id];
  return nbaId
    ? `https://cdn.nba.com/headshots/nba/latest/260x190/${nbaId}.png`
    : `https://www.basketball-reference.com/req/202106291/images/headshots/${encodeURIComponent(id)}.jpg`;
}

function avatar(id, size) {
  const initials = name(id)
    .split(/\s+/)
    .filter((w) => /^[A-Za-z\u00C0-\u017E]/.test(w) && !/^(Jr|Sr|II|III|IV)\.?$/.test(w))   // letters, incl. accented
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const img = `<img src="${photoUrl(id)}" alt="" loading="lazy" onload="this.parentNode.classList.add('loaded')" onerror="this.remove()">`;
  return `<span class="avatar ${size}" aria-hidden="true"><span class="initials">${escapeHtml(initials)}</span>${img}</span>`;
}

// A player's name as a link to his page. Games use this only once a round is
// over (the page would give answers away), and open it in a new tab so the
// result stays on screen.
function playerLink(id, text = name(id)) {
  return `<a class="plink" href="player.html?id=${encodeURIComponent(id)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function showLoadError(err) {
  const status = $("status");
  status.hidden = false;
  status.classList.add("error");
  status.textContent =
    `Couldn't load data (${err.message}). Open this page through a local server: ` +
    "run `python3 -m http.server` in this folder, then visit http://localhost:8000";
}

// Team colors for badges (Career Path, Blind Résumé). Anything missing gets a neutral gray.
const TEAM_COLORS = {
  ATL: "#E03A3E", BOS: "#007A33", BRK: "#2B2B2B", NJN: "#002A60", CHA: "#2E5A88", CHH: "#00788C",
  CHO: "#1D1160", CHI: "#CE1141", CLE: "#860038", DAL: "#00538C", DEN: "#0E2240", DET: "#C8102E",
  GSW: "#1D428A", HOU: "#CE1141", IND: "#002D62", KCK: "#0077C0", LAC: "#C8102E", SDC: "#1D428A",
  LAL: "#552583", MEM: "#5D76A9", VAN: "#00B2A9", MIA: "#98002E", MIL: "#00471B", MIN: "#0C2340",
  NOH: "#00788C", NOP: "#0C2340", NYK: "#F58426", OKC: "#007AC1", SEA: "#00653A", ORL: "#0077C0",
  PHI: "#006BB6", PHO: "#1D1160", POR: "#E03A3E", SAC: "#5A2D81", SAS: "#3A3A3A", TOR: "#CE1141",
  UTA: "#002B5C", WAS: "#002B5C", WSB: "#C8102E",
};

const teamColor = (abbr) => TEAM_COLORS[abbr] || "#3a3f4d";

// ---------- games ----------
// Every game, in menu order. The home page cards, the Games menu, and each
// game's how-to popup all come from here, so a new game needs one entry.
//   isNew: shows a "New" badge on the home page and in the Games menu
//   daily: the localStorage key of a daily puzzle's saved results
//   summary: (result) => short text for one day's result, like "83/100"
//   emoji: one emoji for the "share your day" card
//   howto: three [title, text] steps for the "How to play" popup
const GAMES = [
  {
    page: "rank.html", emoji: "📊", title: "Rank the Five", tag: "Daily puzzle", art: "rank", daily: "r5-v1",
    summary: (r) => `${r.score}/100`,
    blurb: "Five players, one hidden stat. Put them in order from highest to lowest. Everyone gets the same puzzle each day.",
    howto: [
      ["Reveal the stat", "Five players show up. Tap Reveal to see today's hidden stat."],
      ["Rank them", "Drag the rows, or tap the arrows, from highest at the top to lowest at the bottom."],
      ["Lock in", "🟩 right spot · 🟨 one off · 🟥 two or more off. One try a day, then share your score."],
    ],
  },
  {
    page: "connections.html", emoji: "🧩", title: "Hoop Connections", tag: "Daily puzzle", art: "connections", daily: "cx-v1", isNew: true,
    summary: (r) => (r.won ? (r.mistakes ? `Solved · ${r.mistakes} miss${r.mistakes === 1 ? "" : "es"}` : "Perfect") : `${r.found ?? 0} of 4`),
    blurb: "Sixteen players, four hidden groups: colleges, teams, awards, career facts, even names. Find all four.",
    howto: [
      ["Pick four", "Tap four players you think share something: a college, a team, an award, a career fact, or their name."],
      ["Submit", "Right, and the group locks in. “One away…” means three of your four fit. Four mistakes ends it. Stuck? Hint gives a nudge, a pair, or the category."],
      ["Easiest to hardest", "Colors run 🟩 🟨 🟧 🟥 from the easiest group to the hardest. Every player fits exactly one group."],
    ],
  },
  {
    page: "guess.html", emoji: "🕵️", title: "Guess the Player", tag: "Daily puzzle", art: "guess", daily: "gp-v1", isNew: true,
    summary: (r) => (r.won ? `${r.guesses}/8` : "X/8"),
    blurb: "One mystery player a day. Every guess shows if you're warmer on team, position, height, debut, draft pick, and All-Stars.",
    howto: [
      ["Guess anyone", "Type any player from the last 25 years. You get eight guesses."],
      ["Read the clues", "🟩 matches the mystery player. 🟨 is close: same division, an overlapping position, or a number within 2. 🟧 on the team means same conference, different division. Arrows point toward his number."],
      ["Stuck?", "Hint reveals his career averages, then his college, then his initials. Retired players' team is the one they played the most games for. Hard mode is a second daily with deeper cuts and only 🟩 colors."],
    ],
  },
  {
    page: "awards.html", emoji: "🏆", title: "Awards Grid", tag: "Daily puzzle", art: "awards", daily: "ag-v1", isNew: true,
    summary: (r) => `${r.score}/9`,
    blurb: "A 3×3 grid of teams, awards, and milestones. Name a player who fits both sides of every square.",
    howto: [
      ["Pick a square", "Each square sits where a row and a column cross, like Lakers × MVP or Spurs × Duke."],
      ["Name a player", "Type someone who fits both. You get nine guesses for nine squares, and each player counts only once."],
      ["Go deep", "Originality rewards deep cuts: 0 for the most famous answer, up to 100 for the least. When you're done, tap a square to see who else fit."],
    ],
  },
  {
    page: "chain.html", title: "Teammate Chain", tag: "Puzzle", art: "chain",
    blurb: "Connect two players through guys who played with them. Find the link in as few guesses as you can.",
    howto: [
      ["Two players", "You get a start player and a target player."],
      ["Name a teammate", "Type someone who played with the last player in your chain: same team, same season."],
      ["Reach the target", "You're done when someone in your chain played with the target. Stuck? Hint describes a mystery teammate."],
    ],
  },
  {
    page: "path.html", title: "Career Path", tag: "Guess who", art: "path", isNew: true,
    blurb: "Name the player from nothing but the teams he played for. Every miss unlocks a clue.",
    howto: [
      ["Read the path", "You see every team a player suited up for, in order, with the years."],
      ["Guess who", "Type any player. You get six tries."],
      ["Misses unlock clues", "Position and height, then draft, career numbers, All-Star picks, and finally his initials."],
    ],
  },
  {
    page: "stat.html", title: "Stat Line", tag: "Guess who", art: "stat", isNew: true,
    blurb: "One real season's stat line, no name. Who put it up? Every miss unlocks a clue.",
    howto: [
      ["Read the line", "You see one real season: points, rebounds, assists, shooting, games, and minutes."],
      ["Name him", "Type any player. You get four tries."],
      ["Misses unlock clues", "First his team, then his age and position, then his initials. Keep a streak going: Easy is star seasons since 1996, Hard is any starter since 1986."],
    ],
  },
  {
    page: "draftday.html", title: "Draft Day", tag: "Guess who", art: "draftday", isNew: true,
    blurb: "A draft year and a pick number. Who went there? Every miss unlocks a clue.",
    howto: [
      ["Year and pick", "You see a draft year and a first-round pick number, like 2003, #5."],
      ["Name the pick", "Type any player. You get four tries, and a wrong guess tells you where that player actually went."],
      ["Misses unlock clues", "The team that picked, then his college and position, then his initials. Easy is lottery picks since 1995; Hard is the whole first round since 1985."],
    ],
  },
  {
    page: "college.html", title: "College Connect", tag: "Endless", art: "college", isNew: true,
    blurb: "A college and an NBA team. Name anyone who played for both. How long can you keep it going?",
    howto: [
      ["A school and a team", "Like Duke × Bulls or Kentucky × Kings. Teams include their old names (the Sonics count as the Thunder)."],
      ["Name anyone who fits", "Any player from 1980 on who went to that college and played for that franchise. Three guesses per pair."],
      ["Keep the streak", "Run out of guesses and the streak resets. After each pair you see everyone who fit. Easy sticks to big programs; Hard can be any school."],
    ],
  },
  {
    page: "higher.html", title: "Higher or Lower", tag: "Endless", art: "higher",
    blurb: "More career points? Fewer rebounds? Call it right to keep your streak alive. It gets tighter as you go.",
    howto: [
      ["One number shown", "The left player's career stat is showing. The right player's is hidden."],
      ["More or fewer?", "Guess whether the right player has more or fewer. The ↑ and ↓ keys work too."],
      ["Keep it going", "Mixed mode brings a new stat every round; or pick one stat to stick with. The two numbers get closer the longer your streak runs."],
    ],
  },
  {
    page: "timeline.html", title: "Timeline", tag: "Endless", art: "timeline", isNew: true,
    blurb: "MVPs, #1 picks, titles, first All-Star nods. Put five moments in order, oldest to newest. Three lives.",
    howto: [
      ["Five moments", "Award wins, #1 draft picks, championships, and first All-Star selections, all from 1980 on."],
      ["Put them in order", "Drag the rows (or tap the arrows) from oldest at the top to most recent at the bottom."],
      ["Three lives", "A perfect order scores a point. Anything less costs a life. Easy keeps the years far apart; Hard doesn't."],
    ],
  },
  {
    page: "resume.html", title: "Blind Résumé", tag: "10 rounds", art: "resume", isNew: true,
    blurb: "Two anonymous stat lines, side by side: whole careers, single seasons, or whole teams. Pick the better one, then see who they were.",
    howto: [
      ["Pick a mode", "Careers: judged by career Win Shares. Seasons: one year each, judged by Box Plus/Minus. Teams: two teams from the same season, judged by win %."],
      ["Pick the better one", "Players are similar positions with similar scoring, so look past points. A and B keys work too."],
      ["Ten rounds", "Each pick reveals who they were. Green marks the better number in each row."],
    ],
  },
  {
    page: "draft.html", pages: ["draft.html", "mvp.html", "team.html"], title: "Hindsight", tag: "History", art: "hindsight",
    tabs: [["draft.html", "Draft Redo"], ["mvp.html", "MVP Ballot"], ["team.html", "Name the Team"]],
    blurb: "Rewrite history: re-draft a class, re-vote an MVP race, name an All-NBA team, or a whole roster against the clock.",
    howto: [
      ["Three tabs", "Draft Redo: build the top 10 a class should have been. MVP Ballot: order a season's top five MVP finishers. Name the Team: name an All-NBA, All-Defense, or All-Rookie team, or a whole roster in 60 seconds."],
      ["Order or name them", "Drag players into order (arrows work too), or type names to fill a team. Pick any year, or hit Random."],
      ["See how you did", "Draft Redo is scored on career Win Shares, MVP Ballot on the real vote, Name the Team on how many you got (the bar is lower for harder teams, and Full Roster needs 5)."],
    ],
  },
  {
    page: "blind.html", title: "Blind Draft", tag: "Solo draft", art: "blind", isNew: true,
    blurb: "Draft a starting five from anonymous stat lines. Hidden Win Shares reveal who you really picked.",
    howto: [
      ["One position a round", "Point guard, shooting guard, small forward, power forward, center. Each round shows four real seasons with no names."],
      ["Pick the best one", "They all score about the same, so look at the whole line: efficiency, defense, minutes. Tap a card, or press A–D."],
      ["See who you drafted", "Names and Win Shares are revealed at the end. Your score is your five's Win Shares out of the best five you could have picked."],
    ],
  },
  {
    page: "snake.html", title: "Snake Draft", tag: "Versus", art: "snake",
    blurb: "Draft real player-seasons against a computer GM. Box scores are shown, Win Shares decide the winner.",
    howto: [
      ["Snake order", "You and a computer GM (or a friend on the same device) take turns (A, B, B, A, A…) until each has five."],
      ["Fill a lineup", "You need 2 guards, 2 forwards, and a center, picked from 30 real seasons."],
      ["Win Shares decide", "Cards show box scores. Hidden Win Shares decide the winner, so watch for high-scoring traps."],
    ],
  },
];

const BALL_ICON = `
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="14" fill="#ff6b1a"/>
    <g fill="none" stroke="#1a0e06" stroke-width="1.8">
      <circle cx="16" cy="16" r="14"/>
      <path d="M2 16h28M16 2v28M6.2 6.2c5 4.2 5 15.4 0 19.6M25.8 6.2c-5 4.2-5 15.4 0 19.6"/>
    </g>
  </svg>`;

const HERE = location.pathname.split("/").pop() || "index.html";   // index.html is the home page
const THIS_GAME = GAMES.find((g) => g.page === HERE || g.pages?.includes(HERE));

// ---------- Modern tab ----------
// Every game can be played "modern": only players from LeBron's 2003 draft
// class on (or undrafted players who debuted from 2003-04 on), and for games
// built on single seasons, only seasons from 2009-10 on. The choice is saved
// per page, and modern play keeps its own saves (eraKey) and its own daily
// puzzles (eraSeed), so normal streaks are never touched.
const MODERN_SEASON = 2010;   // first season (2009-10) for season-based games
const MODERN_DRAFT = 2003;
const ERA_KEY = `era:${HERE}`;
const MODERN = (() => {
  try {
    const asked = new URLSearchParams(location.search).get("era");
    if (asked) localStorage.setItem(ERA_KEY, asked === "modern" ? "modern" : "all");
    return localStorage.getItem(ERA_KEY) === "modern";
  } catch { return false; }
})();
data.modern = new Set();       // filled by loadCommon in modern mode
const isModern = (id) => data.modern.has(id);
const eraKey = (key) => (MODERN ? `${key}:modern` : key);
const eraSeed = (seed) => (MODERN ? `modern:${seed}` : seed);
// Keep a player (id), or a player-season (id, season), in the current era.
const inEra = (id, season) => !MODERN || (isModern(id) && (season == null || season >= MODERN_SEASON));

function setEra(modern) {
  try { localStorage.setItem(ERA_KEY, modern ? "modern" : "all"); } catch {}
  const url = new URL(location.href);
  url.searchParams.delete("era");
  location.href = url.toString();   // reload: every game starts fresh in the new era
}

function renderEraTabs() {
  const topbar = document.querySelector(".topbar");
  if (!THIS_GAME || !topbar || document.querySelector(".era-tabs")) return;
  topbar.insertAdjacentHTML("afterend", `
    <nav class="era-tabs" aria-label="Era">
      <button type="button" data-era="all" aria-pressed="${!MODERN}">All eras</button>
      <button type="button" data-era="modern" aria-pressed="${MODERN}">Modern <small>2003 class on</small></button>
    </nav>`);
  for (const btn of document.querySelectorAll(".era-tabs button")) {
    btn.addEventListener("click", () => { if ((btn.dataset.era === "modern") !== MODERN) setEra(btn.dataset.era === "modern"); });
  }
  if (MODERN) document.documentElement.classList.add("modern-era");
}

// Small drawings of each game, in the site's colors (home page cards and how-to popups).
const GAME_ART = {
  rank: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <rect x="10" y="8" width="100" height="12" rx="4" fill="var(--green)"/>
      <rect x="10" y="24" width="100" height="12" rx="4" fill="var(--near)"/>
      <rect x="10" y="40" width="100" height="12" rx="4" fill="var(--green)"/>
      <rect x="10" y="56" width="100" height="12" rx="4" fill="var(--red)"/>
      <rect x="10" y="72" width="100" height="12" rx="4" fill="var(--green)"/>
    </svg>`,
  connections: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      ${[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => {
        const fill = r === 0 ? "var(--green)" : r === 1 && c < 4 ? "var(--near)" : "var(--surface-2)";
        return `<rect x="${14 + c * 24}" y="${5 + r * 21}" width="20" height="17" rx="4" fill="${fill}"/>`;
      }).join("")).join("")}
    </svg>`,
  guess: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      ${[0, 1, 2].map((r) => [0, 1, 2, 3, 4, 5].map((c) => {
        const fill = r === 2 || (r === 1 && c % 2 === 0) || (r === 0 && c === 3) ? "var(--green)" : (r + c) % 3 === 0 ? "var(--near)" : "var(--surface-2)";
        return `<rect x="${8 + c * 18}" y="${10 + r * 18}" width="14" height="14" rx="3" fill="${fill}"/>`;
      }).join("")).join("")}
      <circle cx="60" cy="76" r="10" fill="var(--accent)"/>
      <text x="60" y="80" text-anchor="middle" font-size="12" font-weight="800" fill="var(--on-accent)">?</text>
    </svg>`,
  awards: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <rect x="8" y="6" width="22" height="18" rx="4" fill="none" stroke="var(--line)" stroke-width="2"/>
      ${[0, 1, 2].map((i) => `
        <rect x="${36 + i * 26}" y="6" width="22" height="18" rx="4" fill="${["#552583", "var(--accent)", "#007A33"][i]}"/>
        <rect x="8" y="${30 + i * 20}" width="22" height="16" rx="4" fill="${["#C4CED4", "#CE1141", "#98002E"][i]}"/>`).join("")}
      ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${36 + c * 26}" y="${30 + r * 20}" width="22" height="16" rx="4" fill="${(r * 3 + c) % 4 === 1 ? "var(--surface-2)" : "var(--green)"}"/>`).join("")).join("")}
    </svg>`,
  timeline: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <path d="M16 12 V80" stroke="var(--line)" stroke-width="4" stroke-linecap="round"/>
      ${[0, 1, 2, 3].map((i) => `
        <circle cx="16" cy="${16 + i * 20}" r="6" fill="${i === 3 ? "var(--near)" : "var(--green)"}"/>
        <rect x="30" y="${10 + i * 20}" width="${[60, 74, 50, 66][i]}" height="12" rx="4" fill="var(--surface-2)"/>
        <text x="${36}" y="${19 + i * 20}" font-size="8" font-weight="800" fill="var(--muted)">${[1984, 1996, 2003, 2016][i]}</text>`).join("")}
    </svg>`,
  stat: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      ${[["27.4", "PPG"], ["8.1", "RPG"], ["6.3", "APG"]].map(([v, l], i) => `
        <rect x="${6 + i * 38}" y="12" width="32" height="40" rx="6" fill="${i === 0 ? "var(--accent)" : "var(--surface-2)"}"/>
        <text x="${22 + i * 38}" y="34" text-anchor="middle" font-size="11" font-weight="800" fill="${i === 0 ? "var(--on-accent)" : "var(--text)"}">${v}</text>
        <text x="${22 + i * 38}" y="46" text-anchor="middle" font-size="7" font-weight="800" fill="${i === 0 ? "var(--on-accent)" : "var(--muted)"}">${l}</text>`).join("")}
      <rect x="6" y="60" width="108" height="20" rx="6" fill="var(--surface-2)"/>
      <text x="60" y="74" text-anchor="middle" font-size="11" font-weight="800" fill="var(--muted)">? ? ?</text>
    </svg>`,
  blind: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      ${[0, 1, 2, 3].map((i) => `
        <rect x="${6 + i * 28}" y="14" width="24" height="44" rx="5" fill="var(--surface-2)" ${i === 1 ? 'stroke="var(--accent)" stroke-width="3"' : ""}/>
        <circle cx="${18 + i * 28}" cy="27" r="6" fill="var(--line)"/>
        <rect x="${10 + i * 28}" y="38" width="16" height="4" rx="2" fill="var(--line)"/>
        <rect x="${10 + i * 28}" y="46" width="12" height="4" rx="2" fill="var(--line)"/>`).join("")}
      ${["PG", "SG", "SF", "PF", "C"].map((p, i) => `<rect x="${6 + i * 22}" y="66" width="18" height="14" rx="3" fill="${i < 2 ? "var(--green)" : "var(--surface-2)"}"/>`).join("")}
    </svg>`,
  draftday: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <rect x="14" y="10" width="92" height="56" rx="8" fill="var(--surface-2)"/>
      <text x="60" y="30" text-anchor="middle" font-size="11" font-weight="800" fill="var(--muted)">2003 DRAFT</text>
      <text x="60" y="56" text-anchor="middle" font-size="24" font-weight="900" fill="var(--accent)">#5</text>
      <rect x="30" y="72" width="60" height="12" rx="6" fill="var(--line)"/>
      <text x="60" y="81" text-anchor="middle" font-size="8" font-weight="800" fill="var(--text)">? ? ?</text>
    </svg>`,
  college: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <rect x="6" y="22" width="46" height="46" rx="8" fill="#003087"/>
      <path d="M17 42 L29 36 L41 42 L29 48 Z" fill="#fff"/>
      <path d="M22 45 V52 Q29 56 36 52 V45" fill="none" stroke="#fff" stroke-width="2.5"/>
      <text x="60" y="51" text-anchor="middle" font-size="16" font-weight="900" fill="var(--muted)">×</text>
      <rect x="68" y="22" width="46" height="46" rx="8" fill="#CE1141"/>
      <circle cx="91" cy="45" r="11" fill="none" stroke="#fff" stroke-width="3"/>
      <path d="M80 45 H102 M91 34 V56" stroke="#fff" stroke-width="2"/>
    </svg>`,
  chain: `
    <svg viewBox="0 0 120 90" aria-hidden="true" fill="none">
      <path d="M20 70 L50 30 L80 60 L104 20" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 9"/>
      <circle cx="20" cy="70" r="11" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="3"/>
      <circle cx="50" cy="30" r="9" fill="var(--green)"/>
      <circle cx="80" cy="60" r="9" fill="var(--green)"/>
      <circle cx="104" cy="20" r="11" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="3"/>
    </svg>`,
  path: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <path d="M22 18 V72" stroke="var(--line)" stroke-width="4"/>
      ${[["#006BB6", 14], ["#0E2240", 34], ["#C8102E", 54], ["#006BB6", 74]].map(([c, y], i) => `
        <rect x="10" y="${y - 7}" width="24" height="14" rx="4" fill="${c}"/>
        <rect x="42" y="${y - 4}" width="${[58, 46, 52, 38][i]}" height="8" rx="4" fill="var(--surface-2)"/>`).join("")}
      <circle cx="100" cy="74" r="10" fill="var(--accent)"/>
      <text x="100" y="78" text-anchor="middle" font-size="12" font-weight="800" fill="var(--on-accent)">?</text>
    </svg>`,
  higher: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <rect x="6" y="14" width="46" height="62" rx="8" fill="var(--surface-2)"/>
      <rect x="68" y="14" width="46" height="62" rx="8" fill="none" stroke="var(--accent)" stroke-width="3"/>
      <text x="29" y="54" text-anchor="middle" font-size="18" font-weight="800" fill="var(--text)">27.1</text>
      <text x="91" y="56" text-anchor="middle" font-size="26" font-weight="800" fill="var(--accent)">?</text>
      <circle cx="60" cy="45" r="10" fill="var(--accent)"/>
      <text x="60" y="49" text-anchor="middle" font-size="9" font-weight="800" fill="var(--on-accent)">VS</text>
    </svg>`,
  resume: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      ${[8, 64].map((x, i) => `
        <rect x="${x}" y="10" width="48" height="70" rx="6" fill="var(--surface-2)" ${i ? 'stroke="var(--accent)" stroke-width="3"' : ""}/>
        <circle cx="${x + 24}" cy="26" r="8" fill="var(--line)"/>
        <text x="${x + 24}" y="30" text-anchor="middle" font-size="10" font-weight="800" fill="var(--muted)">?</text>
        ${[42, 52, 62].map((y, j) => `<rect x="${x + 8}" y="${y}" width="${[32, 26, 30][j]}" height="5" rx="2.5" fill="${i && j === 1 ? "var(--green)" : "var(--line)"}"/>`).join("")}`).join("")}
    </svg>`,
  hindsight: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      ${[0, 1, 2, 3].map((i) => `
        <text x="6" y="${22 + i * 18}" font-size="11" font-weight="800" fill="var(--muted)">${i + 1}</text>
        <rect x="18" y="${13 + i * 18}" width="${[48, 38, 44, 30][i]}" height="11" rx="4" fill="${i === 0 ? "var(--accent)" : "var(--surface-2)"}"/>`).join("")}
      <rect x="76" y="12" width="40" height="64" rx="6" fill="var(--surface-2)"/>
      <path d="M86 32 l4 4 l9 -10" stroke="var(--green)" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="84" y="46" width="24" height="5" rx="2.5" fill="var(--line)"/>
      <rect x="84" y="57" width="24" height="5" rx="2.5" fill="var(--line)"/>
    </svg>`,
  draft: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      ${[0, 1, 2, 3].map((i) => `
        <text x="12" y="${22 + i * 20}" font-size="13" font-weight="800" fill="var(--muted)">${i + 1}</text>
        <rect x="28" y="${11 + i * 20}" width="${[80, 62, 72, 50][i]}" height="13" rx="4" fill="${i === 0 ? "var(--accent)" : "var(--surface-2)"}"/>`).join("")}
      <text x="98" y="21" text-anchor="end" font-size="9" font-weight="800" fill="var(--on-accent)">#41</text>
    </svg>`,
  mvp: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <rect x="30" y="8" width="60" height="74" rx="6" fill="var(--surface-2)"/>
      <path d="M44 30 l5 5 l10 -11" stroke="var(--green)" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="64" y="26" width="18" height="6" rx="3" fill="var(--muted)"/>
      <rect x="40" y="46" width="42" height="6" rx="3" fill="var(--line)"/>
      <rect x="40" y="58" width="42" height="6" rx="3" fill="var(--line)"/>
      <circle cx="90" cy="16" r="12" fill="var(--accent)"/>
      <text x="90" y="20" text-anchor="middle" font-size="10" font-weight="800" fill="var(--on-accent)">MVP</text>
    </svg>`,
  snake: `
    <svg viewBox="0 0 120 90" aria-hidden="true" fill="none">
      <path d="M14 18 H96 Q108 18 108 30 Q108 42 96 42 H24 Q12 42 12 54 Q12 66 24 66 H106" stroke="var(--line)" stroke-width="10" stroke-linecap="round"/>
      ${[[14, 18, "accent"], [52, 18, "muted"], [96, 18, "muted"], [70, 42, "accent"], [30, 42, "accent"], [40, 66, "muted"], [80, 66, "accent"]]
        .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="6" fill="var(--${c})"/>`).join("")}
    </svg>`,
};


// ---------- icons ----------
// One line-icon set for the site's controls, drawn in the current text color.
const ICON_PATHS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.6 1.3c0 1.7-2.1 2-2.1 3.7"/><path d="M12 17.5v.01"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-6 1.5 1.5 2 2.5 2 4 1-1 1.5-3 1-8z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;

// ---------- light / dark ----------
// Dark is the default. The choice is saved, and every page's <head> applies
// it before anything draws, so there's no flash.
const THEME_KEY = "theme";
const currentTheme = () => (document.documentElement?.dataset?.theme === "light" ? "light" : "dark");

function setTheme(theme) {
  if (!document.documentElement?.dataset) return;
  if (theme === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f6f3ee" : "#0e1015");
  const btn = document.getElementById("theme-button");
  if (btn) {
    btn.innerHTML = icon(theme === "light" ? "moon" : "sun");
    btn.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
  }
}

// ---------- team-colored results ----------
// Games with one answer player tint their result card in his team's color.
function tintResult(team) {
  const result = document.getElementById("result");
  if (!result) return;
  result.classList.toggle("tinted", Boolean(team));
  if (team) result.style.setProperty?.("--result-tint", teamColor(team));
}

// ---------- sound ----------
// Off by default. Tiny tones made on the fly (no audio files): a ding for a
// right answer, a low buzz for a miss, a little run of notes for a win.
const SOUND_KEY = "sound";
let audio = null;
const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) === "on"; } catch { return false; } };

function tone(freq, start, length, { type = "sine", volume = 0.12, slide = 0 } = {}) {
  const t = audio.currentTime + start;
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

function playSound(name) {
  if (!soundOn()) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    if (name === "good") { tone(660, 0, 0.12); tone(990, 0.08, 0.16); }
    else if (name === "bad") tone(220, 0, 0.22, { type: "triangle", volume: 0.14, slide: 0.7 });
    else if (name === "win") [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, { volume: 0.1 }));
    else if (name === "tick") tone(1400, 0, 0.03, { type: "square", volume: 0.03 });
  } catch {}
}

function setSound(on, preview = false) {
  try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch {}
  const btn = document.getElementById("sound-button");
  if (btn) {
    btn.innerHTML = icon(on ? "volume" : "mute");
    btn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
    btn.setAttribute("aria-pressed", String(on));
  }
  if (on && preview) playSound("good");
}

// ---------- site menu ----------
// Every page has an empty <nav class="site-nav">: logo, a Games dropdown, and Players.

function renderNav() {
  const nav = document.querySelector(".site-nav");
  if (!nav) return;
  nav.innerHTML = `
    <a href="index.html" class="site-brand">${BALL_ICON}<span>NBA <b>Minigames</b></span></a>
    <div class="nav-right">
      <div class="games-menu">
        <button type="button" id="games-button" class="menu-button" aria-expanded="false" aria-controls="games-panel">
          ${THIS_GAME ? escapeHtml(THIS_GAME.title) : "Games"} ${icon("chevron")}
        </button>
        <div id="games-panel" class="games-panel" hidden>
          <a href="index.html" class="panel-home">All games</a>
          ${GAMES.map((g) => `
            <a href="${g.page}"${g === THIS_GAME ? ' aria-current="page"' : ""}>
              <span class="panel-title">${escapeHtml(g.title)}${g.isNew ? ' <span class="new-badge">New</span>' : ""}</span>
              <span class="panel-tag">${escapeHtml(g.tag)}</span>
            </a>`).join("")}
        </div>
      </div>
      <a href="player.html" class="nav-link nav-players"${HERE === "player.html" ? ' aria-current="page"' : ""}>${icon("user")}<span>Players</span></a>
      <button type="button" id="sound-button" class="icon-button"></button>
      <button type="button" id="theme-button" class="icon-button"></button>
    </div>`;
  setTheme(currentTheme());
  setSound(soundOn());
  $("sound-button").addEventListener("click", () => setSound(!soundOn(), true));
  $("theme-button").addEventListener("click", () => setTheme(currentTheme() === "light" ? "dark" : "light"));
  renderTabBar();

  const button = $("games-button"), panel = $("games-panel");
  const setOpen = (open) => {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) (panel.querySelector('[aria-current="page"]') || panel.querySelector("a")).focus();
  };
  button.addEventListener("click", () => setOpen(panel.hidden));
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !e.target.closest(".games-menu")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) { setOpen(false); button.focus(); }
  });
}

// ---------- game tabs ----------
// Games made of several pages (like Hindsight) get a tab bar to switch between them.

function renderTabs() {
  const topbar = document.querySelector(".topbar");
  if (!THIS_GAME?.tabs || !topbar) return;
  topbar.querySelector(".eyebrow").textContent = THIS_GAME.title;
  topbar.insertAdjacentHTML("afterend", `
    <nav class="difficulty game-tab-bar" aria-label="${escapeHtml(THIS_GAME.title)}">
      ${THIS_GAME.tabs.map(([page, label]) => `<a href="${page}"${page === HERE ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`).join("")}
    </nav>`);
}

// ---------- how to play ----------
// A "?" button in each game's top bar opens a three-step guide. It also opens
// by itself the first time someone visits that game.

// On phones: a tab bar along the bottom (Home, Today, Games, Players).
function renderTabBar() {
  const daily = THIS_GAME?.daily;
  const active = HERE === "index.html" ? "home" : HERE === "player.html" ? "players" : daily ? "today" : THIS_GAME ? "games" : "";
  const tab = (key, href, iconName, label) =>
    `<a href="${href}" class="tab ${active === key ? "on" : ""}"${active === key ? ' aria-current="page"' : ""}>${icon(iconName)}<span>${label}</span></a>`;
  document.body?.insertAdjacentHTML("beforeend", `
    <nav class="tabbar" aria-label="Sections">
      ${tab("home", "index.html", "home", "Home")}
      ${tab("today", "index.html#today", "calendar", "Today")}
      ${tab("games", "index.html#hub", "grid", "Games")}
      ${tab("players", "player.html", "user", "Players")}
    </nav>`);
}

// Every game page's header gets the game's art and its tag, so they all match.
function decorateHeader() {
  const topbar = document.querySelector(".topbar");
  const eyebrow = topbar?.querySelector(".eyebrow");
  if (!THIS_GAME || !eyebrow || topbar.querySelector(".topbar-art")) return;
  eyebrow.insertAdjacentHTML("beforebegin", `<span class="topbar-art" aria-hidden="true">${GAME_ART[THIS_GAME.art] || ""}</span>`);
  eyebrow.insertAdjacentHTML("afterend", `<span class="topbar-tag">${escapeHtml(THIS_GAME.tag)}</span>`);
}

// Share and save buttons get icons, wherever they are.
function decorateButtons(root = document) {
  for (const [selector, name] of [["#share, [data-day='share']", "share"], ["#save-image, [data-day='image']", "image"]]) {
    for (const btn of root.querySelectorAll(selector)) if (!btn.querySelector(".icon")) btn.insertAdjacentHTML("afterbegin", icon(name));
  }
}

function setupHowTo() {
  const topbar = document.querySelector(".topbar");
  if (!THIS_GAME?.howto || !topbar) return;
  topbar.insertAdjacentHTML("beforeend",
    `<button type="button" id="howto-button" class="howto-button" aria-label="How to play ${escapeHtml(THIS_GAME.title)}">${icon("help")}</button>`);
  document.body.insertAdjacentHTML("beforeend", `
    <dialog id="howto" class="howto" aria-labelledby="howto-title">
      <div class="howto-art">${GAME_ART[THIS_GAME.art] || ""}</div>
      <span class="label">How to play</span>
      <h2 id="howto-title">${escapeHtml(THIS_GAME.title)}</h2>
      <ol class="howto-steps">
        ${THIS_GAME.howto.map(([title, text], i) => `
          <li><span class="howto-num">${i + 1}</span><span><b>${escapeHtml(title)}</b>${escapeHtml(text)}</span></li>`).join("")}
      </ol>
      <button type="button" id="howto-close" class="primary wide">Let's play</button>
    </dialog>`);
  const dialog = $("howto");
  const open = () => { if (!dialog.open) dialog.showModal?.(); };
  $("howto-button").addEventListener("click", open);
  $("howto-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });   // click outside the card

  const key = `howto-seen:${THIS_GAME.page}`;
  let seen = false;
  try { seen = Boolean(localStorage.getItem(key)); localStorage.setItem(key, "1"); } catch {}
  if (!seen) open();
}

// ---------- sharing ----------
// On phones, open the share menu (Messages, Instagram, ...); elsewhere, copy.
// The game's link goes at the end so friends can tap straight in.

async function shareResult(text, messageEl) {
  let link = location.href.split(/[?#]/)[0];
  // Modern results say so, and the link opens the Modern tab for friends.
  if (MODERN) {
    const [first, ...rest] = text.split("\n");
    text = [`${first} · Modern`, ...rest].join("\n");
    link += "?era=modern";
  }
  const full = `${text}\n${link}`;
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ text: full }); return; }
    catch (err) { if (err.name === "AbortError") return; }   // they closed the menu
  }
  try {
    await navigator.clipboard.writeText(full);
    messageEl.textContent = "Copied! Paste it in the group chat.";
  } catch {
    messageEl.textContent = full;   // clipboard blocked: show it to copy by hand
  }
}

// ---------- confetti ----------
// A short burst for perfect scores and big wins. Skipped for people who've
// asked their device for less motion.

function celebrate({ big = false } = {}) {
  playSound("win");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = (canvas.width = innerWidth * dpr), h = (canvas.height = innerHeight * dpr);
  const colors = ["#ff6b1a", "#ffb43a", "#36e2a4", "#ffc445", "#ff5a73", "#f6f3ee"];
  const bits = Array.from({ length: big ? 360 : 140 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.35,
    vx: (Math.random() - 0.5) * 22 * dpr, vy: (-Math.random() * 18 - 6) * dpr,
    size: (6 + Math.random() * 6) * dpr, spin: Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    for (const b of bits) {
      b.vy += 0.55 * dpr; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.spin += 0.2;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.spin);
      ctx.globalAlpha = Math.max(0, 1 - t / (big ? 2800 : 1800));
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
      ctx.restore();
    }
    if (t < (big ? 2800 : 1800)) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

// ---------- streak milestones ----------
// 7, 30, 100, and 365 days in a row of a daily puzzle get a callout and big confetti.

const MILESTONES = { 7: "One week straight", 30: "A full month", 100: "Triple digits", 365: "A whole year" };

function streakMilestone(streak) {
  return MILESTONES[streak] ? `🔥 ${streak}-day streak. ${MILESTONES[streak]}!` : null;
}

// ---------- result images ----------
// "Save image" draws your result as a 1080x1350 picture (good for Instagram)
// and opens the phone share menu, or downloads it on a computer.
//   title: the game, kicker: small line above, big: the score line,
//   grid: emoji rows, lines: short text lines under the score

async function shareImage(result, messageEl) {
  const canvas = await resultCanvas(result);
  const { title } = result;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const file = new File([blob], `${title.toLowerCase().replace(/\W+/g, "-")}-result.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ files: [file] }); return; }
    catch (err) { if (err.name === "AbortError") return; }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  if (messageEl) messageEl.textContent = "Image saved.";
}

async function resultCanvas({ title, kicker = "", big, grid = [], lines = [] }) {
  await document.fonts?.ready;
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const color = (v) => css.getPropertyValue(v).trim();
  const font = (weight, size) => `${weight} ${size}px "Bricolage Grotesque", system-ui, sans-serif`;

  // Ground, glow, and faint court lines
  ctx.fillStyle = color("--bg"); ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -120, 40, W / 2, -120, 900);
  glow.addColorStop(0, "rgba(255,107,26,0.22)"); glow.addColorStop(1, "rgba(255,107,26,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(W / 2, 0, 230, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H, 380, Math.PI, 2 * Math.PI); ctx.stroke();

  // Top rule with the ball
  const rule = ctx.createLinearGradient(90, 0, W - 90, 0);
  rule.addColorStop(0, color("--accent")); rule.addColorStop(0.7, color("--accent-2")); rule.addColorStop(1, "rgba(255,180,58,0)");
  ctx.fillStyle = rule; ctx.fillRect(100, 118, W - 190, 6);
  ctx.fillStyle = color("--accent"); ctx.beginPath(); ctx.arc(96, 121, 16, 0, 2 * Math.PI); ctx.fill();

  let y = 210;
  ctx.fillStyle = color("--text"); ctx.font = font(800, 44);
  ctx.fillText("NBA", 90, y);
  ctx.fillStyle = color("--accent"); ctx.fillText("Minigames", 90 + ctx.measureText("NBA ").width, y);

  y += 100;
  ctx.fillStyle = color("--accent"); ctx.font = font(800, 34);
  ctx.fillText(kicker.toUpperCase(), 90, y);
  y += 90;
  ctx.fillStyle = color("--text"); ctx.font = font(800, 88);
  ctx.fillText(title, 90, y);
  y += 170;
  ctx.font = font(800, 170);
  ctx.fillText(big, 84, y);

  // Emoji rows: smaller when there are more of them, and at most six so they
  // never run into the web address at the bottom.
  const rows = grid.slice(0, 6);
  const cell = rows.length > 4 ? 60 : rows.length > 2 ? 72 : 88;
  ctx.font = `${cell}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  y += 30;
  for (const row of rows) { y += cell + 14; ctx.fillText(row, 90, y); }

  y += 70;
  ctx.fillStyle = color("--muted"); ctx.font = font(600, 40);
  for (const line of lines) { if (y > H - 170) break; ctx.fillText(line, 90, y); y += 54; }

  ctx.fillStyle = color("--muted"); ctx.font = font(700, 34);
  ctx.fillText(location.host + location.pathname.replace(/[^/]*$/, ""), 90, H - 90);
  return canvas;
}

// ---------- visitor counts ----------
// Anonymous page-view counts through GoatCounter: no cookies, nothing
// personal. Off until ANALYTICS_CODE is set to the site's GoatCounter code.
// Stays off on the laptop (localhost) so testing doesn't count as visits.

const ANALYTICS_CODE = "nbaminigames";   // stats at https://nbaminigames.goatcounter.com

if (ANALYTICS_CODE && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${ANALYTICS_CODE}.goatcounter.com/count`;
  document.head.appendChild(s);
}

// ---------- installed app ----------
// sw.js lets the site be installed as an app and open without a connection.
// Skipped on the laptop's test server so testing always sees fresh files.

if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Android/Chrome offer a one-tap install; keep that offer for the home page's button.
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  document.dispatchEvent(new Event("installable"));
});

const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

// ---------- page setup ----------

// Credit line under every page's footer.
document.querySelector("footer")?.insertAdjacentHTML(
  "afterend",
  `<p class="credit">Stats from Basketball-Reference via the Kaggle dataset “NBA Stats (1947-present)”.
   Headshots from NBA.com and Basketball-Reference. A fan project, not affiliated with the NBA.
   Visits are counted anonymously with GoatCounter (no cookies, nothing personal). <a href="about.html">About this site</a></p>`
);

// Accessibility: a skip link, and screen readers announce game messages as they change.
{
  const main = document.querySelector("main");
  if (main) {
    main.id ||= "main";
    document.body.insertAdjacentHTML("afterbegin", `<a class="skip-link" href="#${main.id}">Skip to the game</a>`);
  }
}
for (const id of ["message", "share-msg", "state", "status"]) {
  document.getElementById(id)?.setAttribute("aria-live", "polite");
}

renderNav();
renderTabs();
setupHowTo();
decorateHeader();
renderEraTabs();
enhancePlayerInputs();
decorateButtons();

// ---------- drag to reorder ----------
// For a list whose draggable rows carry data-index. Pointer events cover mouse
// and touch; on touch only the .handle starts a drag so the page can still
// scroll. onMove(from, to) must reorder the data and redraw the list.
function enableDragSort(list, { canDrag = () => true, onMove, onEnd = () => {} }) {
  let drag = null;
  const rows = () => [...list.querySelectorAll(":scope > [data-index]")];

  list.addEventListener("pointerdown", (e) => {
    if (!canDrag() || e.button > 0 || e.target.closest("button")) return;
    const row = e.target.closest("[data-index]");
    if (!row || row.parentNode !== list) return;
    if (e.pointerType !== "mouse" && !e.target.closest(".handle")) return;
    e.preventDefault();
    drag = { index: +row.dataset.index, pointerId: e.pointerId };
    try { list.setPointerCapture(e.pointerId); } catch {}
    row.classList.add("dragging");
  });

  list.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    // The new spot is the number of other rows whose middle is above the pointer.
    let to = 0;
    rows().forEach((r, i) => {
      const box = r.getBoundingClientRect();
      if (i !== drag.index && e.clientY > box.top + box.height / 2) to++;
    });
    if (to !== drag.index) {
      onMove(drag.index, to);
      drag.index = to;
      rows()[to]?.classList.add("dragging");
    }
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    onEnd();
  };
  list.addEventListener("pointerup", end);
  list.addEventListener("pointercancel", end);
}

// ---------- daily puzzles ----------
// Daily games pick their puzzle from the date with a seeded random number
// generator, so everyone gets the same one without a server.

const FIRST_DAY = "2026-09-28";   // puzzle #1 for every daily game

// Small seeded random number generator (mulberry32): same seed, same numbers.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function todayKey() {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}

function dayNumber(key) {
  const utc = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((utc(key) - utc(FIRST_DAY)) / 86400000) + 1;
}

// Daily games can also play a past day from the archive: rank.html?day=2026-09-29.
// Only real past days count (not the future, not before puzzle #1).
function puzzleDay() {
  const asked = new URLSearchParams(location.search).get("day");
  const today = todayKey();
  if (asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked >= FIRST_DAY && asked < today) return { day: asked, past: true };
  return { day: today, past: false };
}

// { history: { "2026-09-28": result }, archive: { past days played later }, progress }
// saved under one key per game. Archive results never count toward streaks.
function loadDailySave(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && typeof saved === "object") return { history: {}, progress: null, ...saved };
  } catch {}
  return { history: {}, progress: null };
}

function writeDailySave(key, save) {
  try { localStorage.setItem(key, JSON.stringify(save)); } catch {}
  setTimeout(updateNextDaily, 0);   // after the game shows its result
}

// ---------- all of today's dailies ----------
// After you finish one daily, a bar under the result points to the next one
// you haven't played. Once they're all done, it offers one card for the day.

const DAILIES = GAMES.filter((g) => g.daily);
const todaysResult = (g) => loadDailySave(g.daily).history[todayKey()];
const nextDaily = () => DAILIES.find((g) => !todaysResult(g));

function dayShareText() {
  const date = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const done = DAILIES.filter(todaysResult);
  const lines = DAILIES.map((g) => {
    const r = todaysResult(g);
    return `${g.emoji} ${g.title}: ${r ? g.summary(r) : "—"}`;
  });
  return { date, done: done.length, lines, text: `NBA Minigames · ${date} · ${done.length}/${DAILIES.length} dailies\n${lines.join("\n")}` };
}

async function shareDay(messageEl) {
  await shareResult(dayShareText().text, messageEl);
}

function shareDayImage(messageEl) {
  const day = dayShareText();
  shareImage({ title: "My day", kicker: day.date, big: `${day.done}/${DAILIES.length}`, lines: day.lines }, messageEl);
}

// The bar on a daily game's page, shown once today's puzzle is done there.
function updateNextDaily() {
  if (!THIS_GAME?.daily || MODERN || !document.getElementById("result")) return;
  let bar = document.getElementById("next-daily");
  const show = !$("result").hidden && !puzzleDay().past && todaysResult(THIS_GAME);
  if (!show) { if (bar) bar.hidden = true; return; }
  if (!bar) {
    bar = document.createElement("section");
    bar.id = "next-daily";
    bar.className = "next-daily";
    $("result").after(bar);
  }
  const next = nextDaily();
  const done = DAILIES.filter(todaysResult).length;
  bar.hidden = false;
  bar.innerHTML = next
    ? `<span class="label">${done} of ${DAILIES.length} dailies done</span>
       <a class="primary next-daily-go" href="${next.page}">Next: ${escapeHtml(next.title)} →</a>`
    : `<span class="label">All ${DAILIES.length} dailies done today 🎉</span>
       <div class="result-actions">
         <button type="button" class="primary" data-day="share">Share your day</button>
         <button type="button" class="ghost" data-day="image">Save image</button>
       </div>
       <p class="message good" data-day="msg"></p>`;
  decorateButtons(bar);
  const msg = bar.querySelector('[data-day="msg"]');
  bar.querySelector('[data-day="share"]')?.addEventListener("click", () => shareDay(msg));
  bar.querySelector('[data-day="image"]')?.addEventListener("click", () => shareDayImage(msg));
}

// ---------- player picker ----------
// Every "Start typing a player…" box: a dropdown with headshots, the matching
// letters highlighted, accents ignored (doncic finds Dončić), and arrow keys.
// It reads the page's <datalist>, so games keep filling that as before, and
// picking a name submits the guess.

const fold = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const PICKER_LIMIT = 8;
// Career Win Shares by player, loaded the first time someone types, so the
// best-known players come first among equally good matches.
let pickerFame = null;
const loadPickerFame = () => (pickerFame ||= fetchJson("fame").catch(() => ({})));

function setupPicker(input) {
  const list = document.getElementById(input.getAttribute("list"));
  if (!list || input.closest(".picker")) return;
  input.removeAttribute("list");   // no native dropdown
  const wrap = document.createElement("div");
  wrap.className = "picker";
  input.before(wrap);
  wrap.append(input);
  const menuId = `${input.id}-menu`;
  wrap.insertAdjacentHTML("afterbegin", `<span class="picker-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></span>`);
  wrap.insertAdjacentHTML("beforeend", `<ul class="picker-menu" id="${menuId}" role="listbox" hidden></ul>`);
  const menu = wrap.querySelector(".picker-menu");
  Object.assign(input, { autocomplete: "off", spellcheck: false });
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", menuId);

  let options = null, matches = [], active = 0, fame = {};
  const famous = (o) => fame[o.id] || 0;
  new MutationObserver(() => (options = null)).observe(list, { childList: true });
  const load = () => (options ||= [...list.options].map((o) => {
    const label = o.value;
    const m = /^(.*?)\s*\(([^)]*)\)$/.exec(label);
    const nameText = m ? m[1] : label;
    return { label, id: data.labelToId?.[label], name: nameText, sub: m ? m[2] : "", folded: fold(nameText), words: fold(nameText).split(/[\s.'’-]+/) };
  }));

  // 0: the name starts with it, 1: every typed word starts a word of the name, 2: it's in there somewhere.
  const rank = (o, q, qWords) => {
    if (o.folded.startsWith(q)) return 0;
    if (qWords.every((w) => o.words.some((x) => x.startsWith(w)))) return 1;
    if (o.folded.includes(q)) return 2;
    return -1;
  };

  const highlight = (o, q) => {
    const at = o.folded.indexOf(q);
    if (at < 0) return escapeHtml(o.name);
    return `${escapeHtml(o.name.slice(0, at))}<mark>${escapeHtml(o.name.slice(at, at + q.length))}</mark>${escapeHtml(o.name.slice(at + q.length))}`;
  };

  const close = () => { menu.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); };

  function render() {
    const q = fold(input.value.trim());
    if (!q || input.disabled) { matches = []; return close(); }
    const qWords = q.split(/\s+/);
    matches = load()
      .map((o) => [rank(o, q, qWords), o])
      .filter(([r]) => r >= 0)
      .sort((a, b) => a[0] - b[0] || famous(b[1]) - famous(a[1]) || a[1].name.localeCompare(b[1].name))
      .slice(0, PICKER_LIMIT)
      .map(([, o]) => o);
    active = 0;
    if (!matches.length) {
      menu.innerHTML = `<li class="picker-empty">No player by that name</li>`;
    } else {
      menu.innerHTML = matches.map((o, i) => {
        const id = o.id;
        const pic = id && data.players[id] ? avatar(id, "xs") : `<span class="avatar xs">${escapeHtml(o.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2))}</span>`;
        return `<li role="option" id="${menuId}-${i}" class="${i === active ? "active" : ""}" data-i="${i}" aria-selected="${i === active}">
          ${pic}<span class="picker-text"><b>${highlight(o, q)}</b>${o.sub ? `<small>${escapeHtml(o.sub)}</small>` : ""}</span></li>`;
      }).join("");
    }
    menu.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (matches.length) input.setAttribute("aria-activedescendant", `${menuId}-0`);
  }

  function move(step) {
    if (!matches.length) return;
    active = (active + step + matches.length) % matches.length;
    for (const li of menu.querySelectorAll("[data-i]")) {
      const on = Number(li.dataset.i) === active;
      li.classList.toggle("active", on);
      li.setAttribute("aria-selected", String(on));
      if (on) li.scrollIntoView({ block: "nearest" });
    }
    input.setAttribute("aria-activedescendant", `${menuId}-${active}`);
  }

  function choose(i) {
    const o = matches[i];
    if (!o) return;
    input.value = o.label;
    close();
    input.form?.requestSubmit();
  }

  input.addEventListener("input", render);
  // Fame arrives a moment after the first keystroke; re-sort when it does.
  input.addEventListener("input", () => loadPickerFame().then((f) => { if (fame !== f) { fame = f; render(); } }), { once: true });
  input.addEventListener("focus", () => input.value.trim() && render());
  input.addEventListener("blur", () => setTimeout(close, 120));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (menu.hidden) render(); else move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" && !menu.hidden && matches.length) { e.preventDefault(); choose(active); }
    else if (e.key === "Escape" && !menu.hidden) { e.preventDefault(); close(); }
  });
  menu.addEventListener("mousedown", (e) => e.preventDefault());   // keep focus in the box
  menu.addEventListener("click", (e) => {
    const li = e.target.closest("[data-i]");
    if (li) choose(Number(li.dataset.i));
  });
  // The game clears the box after a guess: close the menu with it.
  input.form?.addEventListener("submit", () => setTimeout(() => { if (!input.value) close(); }, 0));
}

function enhancePlayerInputs() {
  for (const input of document.querySelectorAll?.("input[list]") || []) setupPicker(input);
}

// ---------- little moments ----------
// The result's big number counts up when it appears, and a wrong guess shakes
// the input. Both watch the page, so every game gets them for free.

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function countUp(el) {
  const m = /^(\d+)(\D.*)?$/.exec(el.textContent.trim());
  if (!m || el.children.length || reducedMotion()) return;
  const target = Number(m[1]), rest = m[2] || "";
  if (target < 2) return;
  const start = performance.now(), duration = 650;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = `${Math.round(target * (1 - (1 - t) ** 3))}${rest}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function shakeGuess() {
  const input = document.getElementById("guess");
  if (!input || reducedMotion()) return;
  input.classList.remove("shake");
  void input.offsetWidth;   // restart the animation
  input.classList.add("shake");
  setTimeout(() => input.classList.remove("shake"), 450);
}

// A soft tick on main buttons, when sound is on.
document.addEventListener?.("click", (e) => { if (e.target.closest?.("button.primary, .bd-card, .br-card")) playSound("tick"); });

window.addEventListener("load", () => {
  const result = document.getElementById("result");
  if (result) {
    let wasHidden = result.hidden;
    new MutationObserver(() => {
      if (wasHidden && !result.hidden) {
        const big = result.querySelector(".giant");
        if (big) setTimeout(() => countUp(big), 0);   // after the game writes it
      }
      wasHidden = result.hidden;
    }).observe(result, { attributes: true, attributeFilter: ["hidden"] });
  }
  const message = document.getElementById("message");
  let lastMessage = "";
  if (message) {
    new MutationObserver(() => {
      const text = message.textContent.trim();
      if (!text || text === lastMessage) return;
      lastMessage = text;
      if (message.classList.contains("bad")) { shakeGuess(); playSound("bad"); }
      else if (message.classList.contains("good")) playSound("good");
    }).observe(message, { attributes: true, attributeFilter: ["class"], childList: true, characterData: true, subtree: true });
  }
});

// Follow the result panel: it appears when a daily is finished (or reloaded
// finished) and can hide again, like when Guess the Player switches modes.
if (THIS_GAME?.daily) {
  window.addEventListener("load", () => {
    const result = document.getElementById("result");
    if (!result) return;
    new MutationObserver(updateNextDaily).observe(result, { attributes: true, attributeFilter: ["hidden"] });
    updateNextDaily();
  });
}

// A "Your stats" panel for a daily game: a row of numbers, then a bar chart.
//   cells: [[label, value], ...]   rows: [[label, count, isToday], ...]
function statsPanel(el, { title = "Your stats", cells, distTitle, rows }) {
  const played = rows.reduce((sum, [, n]) => sum + n, 0);
  el.hidden = played === 0;
  if (!played) return;
  const most = Math.max(1, ...rows.map(([, n]) => n));
  el.innerHTML = `
    <span class="label">${escapeHtml(title)}</span>
    <div class="stat-grid">${cells.map(([label, value]) => `<div><b>${escapeHtml(String(value))}</b><span>${escapeHtml(label)}</span></div>`).join("")}</div>
    <span class="label">${escapeHtml(distTitle)}</span>
    <ol class="dist">${rows.map(([label, n, today]) => `
      <li><span class="dist-n">${escapeHtml(String(label))}</span><span class="dist-bar ${today ? "today" : ""}" style="width: ${Math.max(8, (n / most) * 100)}%">${n}</span></li>`).join("")}
    </ol>`;
}

// Days in a row with a finished daily puzzle, ending today (or yesterday, if
// today's isn't played yet). Also the longest run ever.
function streaks(history) {
  const days = Object.keys(history).sort();
  const next = (k) => {
    const d = new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) + 1));
    return d.toISOString().slice(0, 10);
  };
  let best = 0, run = 0, prev = null;
  for (const day of days) {
    run = prev && next(prev) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  const today = todayKey();
  const alive = prev === today || (prev && next(prev) === today);
  return { current: alive ? run : 0, best };
}

