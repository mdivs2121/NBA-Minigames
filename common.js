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
    .filter((w) => /^[A-Za-zÀ-ž]/.test(w) && !/^(Jr|Sr|II|III|IV)\.?$/.test(w))
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

// ---------- site menu ----------
// Every page has an empty <nav class="site-nav">; this fills it in. To add a
// game, add it here.
const GAMES = [
  {
    page: "rank.html", title: "Rank the Five", tag: "Daily puzzle", art: "rank",
    blurb: "Five players, one hidden stat. Put them in order from highest to lowest. Everyone gets the same puzzle each day.",
  },
  {
    page: "connections.html", title: "Hoop Connections", tag: "Daily puzzle", art: "connections",
    blurb: "Sixteen players, four hidden groups: colleges, teams, awards, career facts, even names. Find all four.",
  },
  {
    page: "chain.html", title: "Teammate Chain", tag: "Puzzle", art: "chain",
    blurb: "Connect two players through guys who played with them. Find the link in as few guesses as you can.",
  },
  {
    page: "higher.html", title: "Higher or Lower", tag: "Endless", art: "higher",
    blurb: "More career points? Fewer rebounds? Call it right to keep your streak alive. It gets tighter as you go.",
  },
  {
    page: "draft.html", title: "Draft Redo", tag: "Hindsight", art: "draft",
    blurb: "Pick any draft class from 1989 to 2021 and build the top 10 it should have been.",
  },
  {
    page: "mvp.html", title: "MVP Ballot", tag: "Voting", art: "mvp",
    blurb: "A season's top five MVP vote-getters, shuffled. Put them back in the order the voters had them.",
  },
  {
    page: "snake.html", title: "Snake Draft", tag: "Versus", art: "snake",
    blurb: "Draft real player-seasons against a computer GM. Box scores are shown, Win Shares decide the winner.",
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

function renderNav() {
  const nav = document.querySelector(".site-nav");
  if (!nav) return;
  const here = location.pathname.split("/").pop() || "index.html";   // index.html is the hub
  nav.innerHTML = `
    <a href="index.html" class="site-brand">${BALL_ICON}<span>NBA <b>Minigames</b></span></a>
    <div class="game-tabs">
      ${GAMES.map((g) => `<a href="${g.page}"${g.page === here ? ' aria-current="page"' : ""}>${g.title}</a>`).join("")}
      <a href="player.html" class="tab-players"${here === "player.html" ? ' aria-current="page"' : ""}>Players</a>
    </div>`;
}
renderNav();

// Credit line under every page's footer.
document.querySelector("footer")?.insertAdjacentHTML(
  "afterend",
  `<p class="credit">Stats from Basketball-Reference via the Kaggle dataset “NBA Stats (1947-present)”.
   Headshots from NBA.com and Basketball-Reference. A fan project, not affiliated with the NBA.</p>`
);

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

