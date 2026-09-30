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
//   howto: three [title, text] steps for the "How to play" popup
const GAMES = [
  {
    page: "rank.html", title: "Rank the Five", tag: "Daily puzzle", art: "rank", daily: "r5-v1",
    blurb: "Five players, one hidden stat. Put them in order from highest to lowest. Everyone gets the same puzzle each day.",
    howto: [
      ["Reveal the stat", "Five players show up. Tap Reveal to see today's hidden stat."],
      ["Rank them", "Drag the rows, or tap the arrows, from highest at the top to lowest at the bottom."],
      ["Lock in", "🟩 right spot · 🟨 one off · 🟥 two or more off. One try a day, then share your score."],
    ],
  },
  {
    page: "connections.html", title: "Hoop Connections", tag: "Daily puzzle", art: "connections", daily: "cx-v1", isNew: true,
    blurb: "Sixteen players, four hidden groups: colleges, teams, awards, career facts, even names. Find all four.",
    howto: [
      ["Pick four", "Tap four players you think share something: a college, a team, an award, a career fact, or their name."],
      ["Submit", "Right, and the group locks in. “One away…” means three of your four fit. Four mistakes ends it. Stuck? Hint gives a nudge, a pair, or the category."],
      ["Easiest to hardest", "Colors run 🟩 🟨 🟧 🟥 from the easiest group to the hardest. Every player fits exactly one group."],
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
    page: "higher.html", title: "Higher or Lower", tag: "Endless", art: "higher",
    blurb: "More career points? Fewer rebounds? Call it right to keep your streak alive. It gets tighter as you go.",
    howto: [
      ["One number shown", "The left player's career stat is showing. The right player's is hidden."],
      ["More or fewer?", "Guess whether the right player has more or fewer. The ↑ and ↓ keys work too."],
      ["Keep it going", "Every round brings a new stat, and the two numbers get closer the longer your streak runs."],
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
    blurb: "Rewrite history: re-draft a class, re-vote an MVP race, or name every player on an All-NBA team.",
    howto: [
      ["Three tabs", "Draft Redo: build the top 10 a class should have been. MVP Ballot: order a season's top five MVP finishers. Name the Team: name an All-NBA, All-Defense, or All-Rookie team."],
      ["Order or name them", "Drag players into order (arrows work too), or type names to fill a team. Pick any year, or hit Random."],
      ["See how you did", "Draft Redo is scored on career Win Shares, MVP Ballot on the real vote, Name the Team on how many you got (the bar is lower for harder teams)."],
    ],
  },
  {
    page: "snake.html", title: "Snake Draft", tag: "Versus", art: "snake",
    blurb: "Draft real player-seasons against a computer GM. Box scores are shown, Win Shares decide the winner.",
    howto: [
      ["Snake order", "You and a computer GM take turns (A, B, B, A, A…) until each of you has five."],
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
          ${THIS_GAME ? escapeHtml(THIS_GAME.title) : "Games"} <span aria-hidden="true">▾</span>
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
      <a href="player.html" class="nav-link"${HERE === "player.html" ? ' aria-current="page"' : ""}>Players</a>
    </div>`;

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

function setupHowTo() {
  const topbar = document.querySelector(".topbar");
  if (!THIS_GAME?.howto || !topbar) return;
  topbar.insertAdjacentHTML("beforeend",
    `<button type="button" id="howto-button" class="howto-button" aria-label="How to play ${escapeHtml(THIS_GAME.title)}">?</button>`);
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
  const link = location.href.split(/[?#]/)[0];
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

const ANALYTICS_CODE = "";

if (ANALYTICS_CODE && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${ANALYTICS_CODE}.goatcounter.com/count`;
  document.head.appendChild(s);
}

// ---------- page setup ----------

// Credit line under every page's footer.
document.querySelector("footer")?.insertAdjacentHTML(
  "afterend",
  `<p class="credit">Stats from Basketball-Reference via the Kaggle dataset “NBA Stats (1947-present)”.
   Headshots from NBA.com and Basketball-Reference. A fan project, not affiliated with the NBA.</p>`
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

// { history: { "2026-09-28": result }, progress } saved under one key per game.
function loadDailySave(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && typeof saved === "object") return { history: {}, progress: null, ...saved };
  } catch {}
  return { history: {}, progress: null };
}

function writeDailySave(key, save) {
  try { localStorage.setItem(key, JSON.stringify(save)); } catch {}
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

