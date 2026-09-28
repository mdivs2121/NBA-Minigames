// Rank the Five - a daily puzzle. Everyone gets the same five players and a
// hidden stat; you order them highest to lowest and get scored on how close
// you were. The puzzle is picked from the date, so no server is needed.

const FIRST_DAY = "2026-09-28";   // puzzle #1
const FIRST_SEASON = "2005-06";   // oldest season a season category can use
const RECOGNIZABLE_PPG = 15;      // a player needs one 15+ PPG season (20+ games) to appear
const SEASON_MIN_GAMES = 40;
const STORAGE_KEY = "r5-v1";

const count = (v) => Math.round(v).toLocaleString("en-US");
const perGame = (v) => v.toFixed(1);
const percent = (v) => `${(v * 100).toFixed(1)}%`;

// kind "career": whole regular-season career. kind "season": one season, per game.
// gap: the smallest difference allowed between two of the five, so no near-ties.
const CATEGORIES = [
  { id: "c-pts", kind: "career", stat: "pts", title: "Career points", gap: 800, format: count },
  { id: "c-trb", kind: "career", stat: "trb", title: "Career rebounds", gap: 300, format: count },
  { id: "c-ast", kind: "career", stat: "ast", title: "Career assists", gap: 250, format: count },
  { id: "c-stl", kind: "career", stat: "stl", title: "Career steals", gap: 50, format: count },
  { id: "c-blk", kind: "career", stat: "blk", title: "Career blocks", gap: 50, format: count },
  { id: "c-3pm", kind: "career", stat: "x3p", title: "Career 3\u2011pointers made", gap: 60, format: count },
  { id: "c-g", kind: "career", stat: "g", title: "Career games played", gap: 25, format: count },
  { id: "c-td", kind: "career", stat: "trpDbl", title: "Career triple-doubles", gap: 2, format: count },
  { id: "c-sea", kind: "career", stat: "seasons", title: "Seasons played", gap: 1, format: count },

  { id: "s-ppg", kind: "season", stat: "ppg", title: "Points per game", gap: 0.8, format: perGame },
  { id: "s-rpg", kind: "season", stat: "rpg", title: "Rebounds per game", gap: 0.5, format: perGame },
  { id: "s-apg", kind: "season", stat: "apg", title: "Assists per game", gap: 0.4, format: perGame },
  { id: "s-spg", kind: "season", stat: "spg", title: "Steals per game", gap: 0.2, format: perGame },
  { id: "s-bpg", kind: "season", stat: "bpg", title: "Blocks per game", gap: 0.2, format: perGame },
  { id: "s-mpg", kind: "season", stat: "mpg", title: "Minutes per game", gap: 1, format: perGame },
  { id: "s-fg", kind: "season", stat: "fgPct", title: "Field goal %", gap: 0.012, format: percent,
    min: { fga: 8 }, note: "8+ shots a game" },
  { id: "s-3p", kind: "season", stat: "threePct", title: "3\u2011point %", gap: 0.012, format: percent,
    min: { threePa: 3 }, note: "3+ threes a game" },
  { id: "s-ft", kind: "season", stat: "ftPct", title: "Free throw %", gap: 0.012, format: percent,
    min: { fta: 3 }, note: "3+ free throws a game" },
];

Object.assign(data, {
  stats: {},        // playerId -> { career, seasons } from rank_stats.json
  pool: [],         // recognizable playerIds
  seasonList: [],   // "2005-06" ... newest
});

const play = {
  mode: "daily",    // "daily" | "practice"
  day: null,        // "2026-09-28"
  number: null,     // puzzle #
  puzzle: null,     // { category, season, players: [ids], answer: [ids high -> low] }
  order: [],        // the player's current order, high -> low
  revealed: false,
  locked: false,
  result: null,     // { score, exact, emoji }
};

// ---------- data ----------

async function loadData() {
  const [, stats] = await Promise.all([loadCommon(), fetchJson("rank_stats")]);
  data.stats = stats;
  const seasons = new Set();
  for (const [id, s] of Object.entries(stats)) {
    for (const season of Object.keys(s.seasons)) seasons.add(season);
    const scorer = Object.values(s.seasons).some((x) => x.ppg >= RECOGNIZABLE_PPG && x.g >= 20);
    if (scorer && data.players[id]) data.pool.push(id);
  }
  data.pool.sort();   // same order on every device, so the daily pick matches
  data.seasonList = [...seasons].filter((s) => s >= FIRST_SEASON).sort();
}

// ---------- puzzle generation ----------

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

function valueOf(id, category, season) {
  const s = data.stats[id];
  if (category.kind === "career") return s.career[category.stat] ?? null;
  const row = s.seasons[season];
  if (!row || row.g < SEASON_MIN_GAMES) return null;
  for (const [field, min] of Object.entries(category.min || {})) {
    if ((row[field] ?? 0) < min) return null;
  }
  return row[category.stat] ?? null;
}

function makePuzzle(random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  for (let tries = 0; tries < 200; tries++) {
    const category = pick(CATEGORIES);
    const season = category.kind === "season" ? pick(data.seasonList) : null;

    const eligible = data.pool.filter((id) => valueOf(id, category, season) != null);
    // Shuffle (Fisher-Yates) with the seeded generator, then take players whose
    // values are at least `gap` apart from everyone already picked.
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    const chosen = [];
    for (const id of eligible) {
      const v = valueOf(id, category, season);
      if (chosen.every((c) => Math.abs(valueOf(c, category, season) - v) >= category.gap)) chosen.push(id);
      if (chosen.length === 5) break;
    }
    if (chosen.length < 5) continue;

    const answer = [...chosen].sort((a, b) => valueOf(b, category, season) - valueOf(a, category, season));
    return { category, season, players: chosen, answer };
  }
  throw new Error("Couldn't build a puzzle.");
}

// ---------- dates, storage ----------

function todayKey() {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}

function dayNumber(key) {
  const utc = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((utc(key) - utc(FIRST_DAY)) / 86400000) + 1;
}

function loadSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") return { history: {}, progress: null, ...saved };
  } catch {}
  return { history: {}, progress: null };
}

function writeSave(save) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch {}
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

// ---------- game flow ----------

function startDaily() {
  const save = loadSave();
  play.mode = "daily";
  play.day = todayKey();
  play.number = dayNumber(play.day);
  play.puzzle = makePuzzle(rng(hash(`rank-the-five:${play.day}`)));
  play.result = null;

  const done = save.history[play.day];
  const progress = save.progress?.day === play.day ? save.progress : null;
  if (done) {
    play.order = done.order;
    play.revealed = true;
    play.locked = true;
    play.result = scoreOf(play.order, play.puzzle.answer);
  } else {
    play.order = progress?.order?.length === 5 ? progress.order : [...play.puzzle.players];
    play.revealed = Boolean(progress?.revealed);
    play.locked = false;
  }
  render();
}

function startPractice() {
  play.mode = "practice";
  play.day = null;
  play.number = null;
  play.puzzle = makePuzzle(Math.random);
  play.order = [...play.puzzle.players];
  play.revealed = true;
  play.locked = false;
  play.result = null;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function reveal() {
  play.revealed = true;
  saveProgress();
  render();
}

function saveProgress() {
  if (play.mode !== "daily" || play.locked) return;
  const save = loadSave();
  save.progress = { day: play.day, revealed: play.revealed, order: play.order };
  writeSave(save);
}

function lockIn() {
  if (play.locked) return;
  play.locked = true;
  play.result = scoreOf(play.order, play.puzzle.answer);
  if (play.mode === "daily") {
    const save = loadSave();
    save.history[play.day] = { order: play.order, score: play.result.score, exact: play.result.exact };
    save.progress = null;
    writeSave(save);
  }
  render();
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Score: 100 minus how far off each player was. The worst possible order
// (fully reversed) is 12 spots off in total, which scores 0.
function scoreOf(order, answer) {
  const off = order.map((id, i) => Math.abs(answer.indexOf(id) - i));
  const total = off.reduce((a, b) => a + b, 0);
  return {
    off,
    score: Math.round(100 * (1 - total / 12)),
    exact: off.filter((d) => d === 0).length,
    emoji: off.map((d) => (d === 0 ? "🟩" : d === 1 ? "🟨" : "🟥")).join(""),
  };
}

function move(from, to) {
  if (play.locked || to < 0 || to > 4 || from === to) return;
  const [id] = play.order.splice(from, 1);
  play.order.splice(to, 0, id);
  saveProgress();
}

function shareText() {
  const { score, emoji } = play.result;
  const title = play.mode === "daily" ? `Rank the Five #${play.number}` : "Rank the Five (practice)";
  const streak = play.mode === "daily" ? streaks(loadSave().history).current : 0;
  return `${title}\n${emoji} ${score}/100${streak > 1 ? `\n🔥 ${streak}-day streak` : ""}`;
}

async function share() {
  const text = shareText();
  try {
    await navigator.clipboard.writeText(text);
    $("share-msg").textContent = "Copied! Paste it in the group chat.";
  } catch {
    $("share-msg").textContent = text;   // clipboard blocked: show it to copy by hand
  }
}

// ---------- rendering ----------

function render() {
  const { puzzle } = play;
  const daily = play.mode === "daily";

  const state = $("state");
  state.className = "state";
  state.textContent = daily ? `Puzzle #${play.number}` : "Practice";
  if (play.locked && play.result.score >= 75) state.classList.add("win");
  if (play.locked && play.result.score < 40) state.classList.add("lose");

  $("intro").hidden = play.revealed;
  $("board").hidden = !play.revealed;
  $("intro-kicker").textContent = `Puzzle #${play.number} · ${formatDay(play.day)}`;
  $("intro-players").innerHTML = puzzle.players
    .map((id) => `<li>${avatar(id, "md")}<span>${escapeHtml(name(id))}</span></li>`)
    .join("");

  const cat = puzzle.category;
  $("category-kicker").textContent = daily ? `Puzzle #${play.number} · Today's stat` : "Practice round";
  $("category-title").textContent = cat.title;
  $("category-detail").textContent =
    cat.kind === "career"
      ? "Regular season, whole NBA career."
      : `${puzzle.season} regular season${cat.note ? ` · ${cat.note}` : ""} · 40+ games.`;

  renderList();

  $("lock").hidden = play.locked;
  $("drag-tip").hidden = play.locked;
  $("result").hidden = !play.locked;
  if (play.locked) renderResult();

  renderStats();
}

function renderList() {
  const { puzzle } = play;
  const answer = puzzle.answer;
  $("rank-list").innerHTML = play.order
    .map((id, i) => {
      const off = play.locked ? Math.abs(answer.indexOf(id) - i) : null;
      const cls = off === null ? "" : off === 0 ? "hit" : off === 1 ? "near" : "miss";
      const context = puzzle.category.kind === "season" ? seasonContext(id, puzzle.season) : "";
      const value = play.locked
        ? `<span class="value">${puzzle.category.format(valueOf(id, puzzle.category, puzzle.season))}</span>
           <span class="truth">${off === 0 ? "✓" : `#${answer.indexOf(id) + 1}`}</span>`
        : `<span class="arrows">
             <button type="button" class="arrow" data-move="${i},${i - 1}" aria-label="Move ${escapeHtml(name(id))} up" ${i === 0 ? "disabled" : ""}>▲</button>
             <button type="button" class="arrow" data-move="${i},${i + 1}" aria-label="Move ${escapeHtml(name(id))} down" ${i === 4 ? "disabled" : ""}>▼</button>
           </span>`;
      return `
        <li class="rank-row ${cls}" data-index="${i}">
          <span class="rank-num">${i + 1}</span>
          ${play.locked ? "" : `<span class="handle" aria-hidden="true">⋮⋮</span>`}
          ${avatar(id, "md")}
          <span class="rank-body">
            <span class="rank-name">${escapeHtml(name(id))}</span>
            ${context ? `<span class="rank-sub">${context}</span>` : ""}
          </span>
          ${value}
        </li>`;
    })
    .join("");
}

function seasonContext(id, season) {
  const row = data.stats[id].seasons[season];
  return `${row.teams.join(" / ")} · ${row.g} games`;
}

function renderResult() {
  const { score, exact, emoji } = play.result;
  $("result").classList.toggle("lose", score < 40);
  $("result-kicker").textContent =
    score === 100 ? "Perfect order" : score >= 75 ? "Great ranking" : score >= 40 ? "Not bad" : "Tough one";
  $("result-score").textContent = `${score}/100`;
  $("result-emoji").textContent = emoji;
  $("result-text").textContent =
    `${exact} of 5 in the right spot. 🟩 right spot · 🟨 one off · 🟥 two or more off.`;
  $("share-msg").textContent = "";
  $("practice").textContent = play.mode === "daily" ? "Practice round" : "Another practice round";
  $("next").hidden = play.mode !== "daily";
  updateCountdown();
}

function updateCountdown() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(0, Math.round((midnight - now) / 60000));
  $("next").textContent = `Next puzzle in ${Math.floor(mins / 60)}h ${mins % 60}m.`;
  // Past midnight with the page still open: load the new day's puzzle.
  if (play.mode === "daily" && play.day && play.day !== todayKey()) startDaily();
}

function renderStats() {
  const history = Object.values(loadSave().history);
  $("stats").hidden = history.length === 0;
  if (!history.length) return;
  const { current, best } = streaks(loadSave().history);
  $("st-played").textContent = history.length;
  $("st-avg").textContent = Math.round(history.reduce((a, h) => a + h.score, 0) / history.length);
  $("st-streak").textContent = current;
  $("st-max").textContent = best;

  // Exactly 4 right is impossible (the fifth would be right too), so skip it.
  const buckets = [5, 3, 2, 1, 0];
  const counts = buckets.map((n) => history.filter((h) => h.exact === n).length);
  const most = Math.max(1, ...counts);
  const todays = play.mode === "daily" && play.locked ? play.result.exact : null;
  $("st-dist").innerHTML = buckets
    .map((n, i) => `
      <li>
        <span class="dist-n">${n}</span>
        <span class="dist-bar ${n === todays ? "today" : ""}" style="width: ${Math.max(8, (counts[i] / most) * 100)}%">${counts[i]}</span>
      </li>`)
    .join("");
}

function formatDay(key) {
  if (!key) return "";
  const d = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ---------- wiring ----------

enableDragSort($("rank-list"), {
  canDrag: () => !play.locked,
  onMove: (from, to) => { move(from, to); renderList(); },
  onEnd: renderList,
});
$("rank-list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-move]");
  if (!btn) return;
  const [from, to] = btn.dataset.move.split(",").map(Number);
  move(from, to);
  renderList();
  // Keep focus on the moved player's arrow so keyboard users can keep going.
  const [up, down] = $("rank-list").children[to].querySelectorAll(".arrow");
  const wanted = to < from ? up : down;
  (wanted.disabled ? (to < from ? down : up) : wanted).focus();
});
$("reveal").addEventListener("click", reveal);
$("lock").addEventListener("click", lockIn);
$("share").addEventListener("click", share);
$("practice").addEventListener("click", startPractice);
setInterval(updateCountdown, 30000);

loadData()
  .then(() => {
    $("status").hidden = true;
    startDaily();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
