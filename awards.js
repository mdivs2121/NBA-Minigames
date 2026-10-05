// Awards Grid - a daily 3×3 grid. Rows and columns are franchises, awards,
// draft facts, colleges, and stat milestones; each square needs a player who
// fits both. Nine guesses, each player once. Originality scores how deep a cut
// each pick was among everyone who fit (0 = the most famous answer).

const STORAGE_KEY = "ag-v1";   // { history: { day: result }, archive, progress: { day, cells, guesses } }
const GUESSES = 9;
const KNOWN_WS = 15;      // a "known" answer has 15+ career Win Shares
const MIN_KNOWN = 2;      // every square needs at least this many known answers

// How often each family shows up across the top. Awards most, filler least.
const AWARD_FAMILIES = new Set(["award-mvp", "award-dpoy", "award-roy", "award-smoy", "award-mip", "allstar", "allnba", "alldef", "champ", "hof"]);
const WEIGHT_BY_KEY = { undrafted: 0.4, nocollege: 0.4, teams6: 0.6, "3p40": 1 };
const weightOf = (c) => {
  const [key, , , fam] = data.cats[c];
  if (key in WEIGHT_BY_KEY) return WEIGHT_BY_KEY[key];
  if (fam === "team") return 1;
  if (fam === "college") return 0.35;
  return AWARD_FAMILIES.has(fam) ? 3 : 1.5;
};

Object.assign(data, {
  cats: [],           // [key, label, detail, family]
  catIndex: {},       // key -> index
  byId: {},           // id -> { name, from, to, fame, cats: Set }
  labelToId: {},
});

const play = { day: null, past: false, number: 0, rows: [], cols: [], answers: [], cells: [], guesses: 0, selected: null, over: false, peek: null };

// ---------- data ----------

async function loadData() {
  const [, file] = await Promise.all([loadCommon(), fetchJson("awards_grid")]);
  data.cats = file.cats;
  file.cats.forEach(([key], i) => (data.catIndex[key] = i));
  const counts = {};
  for (const [, n] of file.players) counts[n] = (counts[n] || 0) + 1;
  for (const [id, n, from, to, fame, cats] of file.players) {
    data.byId[id] = { name: n, from, to, fame, cats: new Set(cats) };
    data.players[id] ||= { name: n };
    data.labelToId[counts[n] > 1 ? `${n} (${from} – ${to})` : n] = id;
  }
  $("ag-players").innerHTML = Object.keys(data.labelToId).sort().map((l) => `<option value="${escapeHtml(l)}">`).join("");
}

// ---------- the grid ----------

const fits = (id, row, col) => data.byId[id].cats.has(row) && data.byId[id].cats.has(col);
const family = (c) => data.cats[c][3];

// Everyone who fits a square, best-known first.
function answersFor(row, col) {
  return Object.keys(data.byId).filter((id) => fits(id, row, col)).sort((a, b) => data.byId[b].fame - data.byId[a].fame);
}

// Three teams down the side; across the top, at most one more team and the
// rest from other families, awards most often. No family appears twice (except teams), and every
// square needs a few well-known answers. Sometimes flipped for variety.
function makeGrid(random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const pickWeighted = (list) => {
    let r = random() * list.reduce((sum, c) => sum + weightOf(c), 0);
    for (const c of list) if ((r -= weightOf(c)) < 0) return c;
    return list[list.length - 1];
  };
  const teams = data.cats.map((c, i) => i).filter((i) => family(i) === "team");
  const others = data.cats.map((c, i) => i).filter((i) => family(i) !== "team");
  for (let attempt = 0; attempt < 5000; attempt++) {
    const chosen = new Set();
    const take = (list) => {
      const options = list.filter((c) => !chosen.has(c) && (family(c) === "team" || ![...chosen].some((x) => family(x) === family(c))));
      const c = pickWeighted(options);
      chosen.add(c);
      return c;
    };
    const rows = [take(teams), take(teams), take(teams)];
    const teamCols = pick([0, 0, 1]);
    const cols = [];
    for (let i = 0; i < 3; i++) cols.push(take(i < teamCols ? teams : others));
    const answers = rows.flatMap((r) => cols.map((c) => answersFor(r, c)));
    if (answers.every((a) => a.filter((id) => data.byId[id].fame >= KNOWN_WS).length >= MIN_KNOWN)) {
      // Mix up the column order so team columns aren't always first.
      const order = [0, 1, 2].sort(() => random() - 0.5);
      const flip = random() < 0.4;
      const finalCols = order.map((i) => cols[i]);
      return flip ? { rows: finalCols, cols: rows } : { rows, cols: finalCols };
    }
  }
  throw new Error("Couldn't build a grid.");
}

// ---------- scoring ----------

// 0 for the best-known answer in a square, up to 100 for the deepest cut.
function originalityOf(cell) {
  const id = play.cells[cell];
  if (!id) return 0;
  const list = play.answers[cell];
  return list.length > 1 ? Math.round((100 * list.indexOf(id)) / (list.length - 1)) : 0;
}

const filled = () => play.cells.filter(Boolean).length;
const totalOriginality = () => play.cells.reduce((sum, id, i) => sum + originalityOf(i), 0);

// ---------- saving ----------

const loadSave = () => loadDailySave(STORAGE_KEY);
const writeSave = (save) => writeDailySave(STORAGE_KEY, save);

function start() {
  const { day, past } = puzzleDay();
  const save = loadSave();
  const done = save.history[day] || save.archive?.[day];
  // A finished day keeps the grid it was played with, even if the data changes.
  let grid = done?.rows && { rows: done.rows.map((k) => data.catIndex[k]), cols: done.cols.map((k) => data.catIndex[k]) };
  if (!grid || [...grid.rows, ...grid.cols].some((c) => c == null)) grid = makeGrid(rng(hash(`awards-grid:${day}`)));
  Object.assign(play, {
    day, past, number: dayNumber(day), ...grid, selected: null, peek: null,
    answers: grid.rows.flatMap((r) => grid.cols.map((c) => answersFor(r, c))),
  });
  const progress = !past && save.progress?.day === day ? save.progress : null;
  const from = done || progress;
  play.cells = from?.cells?.length === 9 ? from.cells.map((id) => (id && data.byId[id] ? id : null)) : Array(9).fill(null);
  play.guesses = from?.guesses || 0;
  play.over = Boolean(done);
  say("");
  render();
}

function saveProgress() {
  if (play.past) return;
  const save = loadSave();
  save.progress = { day: play.day, cells: play.cells, guesses: play.guesses };
  writeSave(save);
}

// ---------- playing ----------

function select(cell) {
  if (play.over) {
    play.peek = play.peek === cell ? null : cell;
    return render();
  }
  if (play.cells[cell]) return;
  play.selected = cell;
  say("");
  render();
  $("guess").focus({ preventScroll: true });
}

const catLabel = (c) => data.cats[c][1];
const cellName = (cell) => `${catLabel(play.rows[Math.floor(cell / 3)])} × ${catLabel(play.cols[cell % 3])}`;

function submitGuess() {
  if (play.over || play.selected == null) return;
  const text = $("guess").value.trim();
  if (!text) return;
  const id = data.labelToId[text] ?? Object.entries(data.labelToId).find(([l]) => l.toLowerCase() === text.toLowerCase())?.[1];
  if (!id) return say("Pick a name from the list. Names shared by two players include their years.", "bad");
  if (play.cells.includes(id)) return say(`${data.byId[id].name} is already on your grid. Each player only once.`, "bad");
  $("guess").value = "";
  play.guesses++;
  const cell = play.selected;
  if (fits(id, play.rows[Math.floor(cell / 3)], play.cols[cell % 3])) {
    play.cells[cell] = id;
    play.selected = null;
    say(`✓ ${data.byId[id].name} fits. +${originalityOf(cell)} originality.`, "good");
  } else {
    say(`✕ ${data.byId[id].name} doesn't fit ${cellName(cell)}.`, "bad");
  }
  if (filled() === 9 || play.guesses >= GUESSES) return finish();
  saveProgress();
  render();
}

function finish() {
  play.over = true;
  play.selected = null;
  const save = loadSave();
  const key = (c) => data.cats[c][0];
  const result = { rows: play.rows.map(key), cols: play.cols.map(key), cells: play.cells, guesses: play.guesses, score: filled(), originality: totalOriginality() };
  if (play.past) (save.archive ||= {})[play.day] = result;   // archive plays don't touch streaks
  else { save.history[play.day] = result; save.progress = null; }
  writeSave(save);
  const milestone = !play.past && streakMilestone(streaks(loadSave().history).current);
  if (milestone) celebrate({ big: true });
  else if (filled() === 9) celebrate();
  render();
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function say(text, kind = "") {
  $("message").textContent = text;
  $("message").className = `message ${kind}`;
}

// ---------- sharing ----------

const emojiGrid = () => [0, 1, 2].map((r) => [0, 1, 2].map((c) => (play.cells[r * 3 + c] ? "🟩" : "⬜")).join(""));

async function share() {
  const streak = play.past ? 0 : streaks(loadSave().history).current;
  const text = `Awards Grid #${play.number}${play.past ? " (archive)" : ""} 🏆 ${filled()}/9 · Originality ${totalOriginality()}${streak > 1 ? ` · 🔥${streak}` : ""}\n${emojiGrid().join("\n")}`;
  await shareResult(text, $("share-msg"));
}

function saveImage() {
  shareImage({
    title: "Awards Grid",
    kicker: `#${play.number}${play.past ? " · archive" : ""}`,
    big: `${filled()}/9`,
    grid: emojiGrid(),
    lines: [`Originality ${totalOriginality()}`],
  }, $("share-msg"));
}

// ---------- rendering ----------

function header(c) {
  const [key, label, detail, fam] = data.cats[c];
  if (fam === "team") {
    const abbr = key.slice(5);
    return `<div class="ag-head team" style="--team: ${teamColor(abbr)}" title="${escapeHtml(detail)}"><b>${escapeHtml(label)}</b><small>${abbr}</small></div>`;
  }
  return `<div class="ag-head" title="${escapeHtml(detail)}"><b>${escapeHtml(label)}</b><small>${escapeHtml(detail)}</small></div>`;
}

function render() {
  $("kicker").textContent = `Daily #${play.number}${play.past ? ` · from ${play.day}` : ""}`;
  $("left").textContent = GUESSES - play.guesses;
  $("originality").textContent = totalOriginality();

  const state = $("state");
  state.className = "state";
  state.textContent = play.over ? `${filled()} of 9` : `${filled()} filled`;
  if (play.over) state.classList.add(filled() === 9 ? "win" : filled() >= 5 ? "" : "lose");

  let html = `<div class="ag-corner" aria-hidden="true">${BALL_ICON}</div>${play.cols.map(header).join("")}`;
  for (let r = 0; r < 3; r++) {
    html += header(play.rows[r]);
    for (let c = 0; c < 3; c++) {
      const cell = r * 3 + c;
      const id = play.cells[cell];
      const n = play.answers[cell].length;
      const classes = ["ag-cell", id ? "filled" : "", play.selected === cell ? "selected" : "", play.peek === cell ? "peek" : "", play.over && !id ? "missed" : ""].join(" ");
      const body = id
        ? `${avatar(id, "sm")}<span class="ag-name">${escapeHtml(data.byId[id].name)}</span><span class="ag-pts">+${originalityOf(cell)}</span>`
        : play.over ? `<span class="ag-count">${n} fit</span>` : `<span class="ag-plus" aria-hidden="true">+</span>`;
      html += `<button type="button" class="${classes}" data-cell="${cell}" aria-label="${escapeHtml(cellName(cell))}${id ? `: ${escapeHtml(data.byId[id].name)}` : ""}">${body}</button>`;
    }
  }
  $("grid").innerHTML = html;
  for (const btn of $("grid").querySelectorAll(".ag-cell")) btn.addEventListener("click", () => select(Number(btn.dataset.cell)));

  const picking = !play.over && play.selected != null;
  $("cell-label").textContent = play.over ? "" : picking ? `Who fits ${cellName(play.selected)}?` : "Pick a square";
  $("guess").disabled = !picking;
  $("guess-btn").disabled = !picking;
  $("guess-form").hidden = play.over;
  $("result").hidden = !play.over;

  if (play.over) {
    $("result").classList.toggle("lose", filled() < 5);
    $("result-kicker").textContent = filled() === 9 ? "Immaculate" : "Final grid";
    $("result-title").textContent = `${filled()} of 9`;
    $("result-grid").textContent = emojiGrid().join("\n");
    $("result-text").textContent = `Originality ${totalOriginality()} of 900: the deeper the cuts, the higher it goes. ${play.guesses} guess${play.guesses === 1 ? "" : "es"} used.`;
    const milestone = !play.past && streakMilestone(streaks(loadSave().history).current);
    $("milestone").hidden = !milestone;
    if (milestone) $("milestone").textContent = milestone;
    updateCountdown();
  }

  renderStats();

  // After the game: who else fit the tapped square.
  $("answers").hidden = play.peek == null;
  if (play.peek != null) {
    const list = play.answers[play.peek];
    $("answers").innerHTML = `
      <span class="label">${escapeHtml(cellName(play.peek))} · ${list.length} player${list.length === 1 ? "" : "s"} fit</span>
      <ol class="ag-answer-list">${list.slice(0, 12).map((id) => `<li class="${id === play.cells[play.peek] ? "mine" : ""}">${avatar(id, "xs")}${playerLink(id, data.byId[id].name)}</li>`).join("")}</ol>
      ${list.length > 12 ? `<p class="meta">…and ${list.length - 12} more.</p>` : ""}`;
  }
}

function renderStats() {
  const save = loadSave();
  const history = Object.values(save.history);
  const { current, best } = streaks(save.history);
  const avg = history.length ? (history.reduce((sum, h) => sum + h.score, 0) / history.length).toFixed(1) : "–";
  const bucket = (score) => (score <= 4 ? "≤4" : score);
  const todays = play.over && !play.past ? bucket(filled()) : null;
  statsPanel($("stats"), {
    cells: [["Played", history.length], ["Avg squares", avg], ["Streak", current], ["Best streak", best]],
    distTitle: "Squares filled",
    rows: [9, 8, 7, 6, 5, "≤4"].map((n) => [n, history.filter((h) => bucket(h.score) === n).length, n === todays]),
  });
}

function updateCountdown() {
  if (play.past) { $("next").textContent = ""; return; }
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(0, Math.round((midnight - now) / 60000));
  $("next").textContent = `Next grid in ${Math.floor(mins / 60)}h ${mins % 60}m.`;
  if (play.day !== todayKey()) start();   // past midnight with the page open
}

// ---------- wiring ----------

$("guess-form").addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
$("give-up").addEventListener("click", () => !play.over && finish());
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    start();
    setInterval(() => play.over && updateCountdown(), 30000);
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
