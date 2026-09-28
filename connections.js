// Hoop Connections - a daily puzzle: 16 players, 4 hidden groups of 4.
// Groups come from connections.json, one from each difficulty tier
// (1 colleges, 2 teams and awards, 3 career facts, 4 wordplay).
//
// Every category in the data lists ALL of its members from the player pool,
// so a puzzle is only accepted if no player in the grid fits a second group.
// That guarantees exactly one answer.

const STORAGE_KEY = "cx-v1";
const MISTAKES = 4;
const TIER_EMOJI = { 1: "🟩", 2: "🟨", 3: "🟧", 4: "🟥" };

Object.assign(data, {
  categories: [],   // { label, tier, members: Set }
  fame: {},         // id -> how well-known (All-Star picks, awards, scoring)
});

// Each group's four come from its best-known usable players, so the grid is
// mostly names people know, with a little variety.
const FAMOUS_SHORTLIST = 10;

const play = {
  mode: "daily",    // "daily" | "practice"
  day: null,
  number: null,
  groups: [],       // the 4 chosen: { label, tier, players: [4 ids] }, easiest first
  order: [],        // the 16 ids in their current grid order
  selected: new Set(),
  solved: [],       // indexes into groups, in the order found
  guessed: [],      // sorted "id,id,id,id" keys already tried
  guesses: [],      // tiers of each guess's four players, for the share grid
  mistakes: 0,
  found: 0,         // groups you found yourself (the rest get revealed at the end)
  over: false,
  won: false,
};

// ---------- data ----------

async function loadData() {
  const [, cx] = await Promise.all([loadCommon(), fetchJson("connections")]);
  for (const [id, n] of Object.entries(cx.players)) data.players[id] ||= { name: n };
  data.categories = cx.categories.map((c) => ({ ...c, members: new Set(c.members) }));
  data.fame = cx.fame;
}

// ---------- puzzle generation ----------

function makePuzzle(random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const shuffle = (list) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const byTier = [1, 2, 3, 4].map((t) => data.categories.filter((c) => c.tier === t));

  for (let tries = 0; tries < 1000; tries++) {
    const cats = byTier.map(pick);
    // Players who fit exactly one of the four groups can be used.
    const groups = [];
    for (const cat of cats) {
      const others = cats.filter((c) => c !== cat);
      const usable = [...cat.members].filter((id) => !others.some((o) => o.members.has(id)));
      if (usable.length < 4) break;
      // Sort by fame (ties by id, so every device agrees), then pick 4 of the top few.
      usable.sort((a, b) => data.fame[b] - data.fame[a] || (a < b ? -1 : 1));
      groups.push({ label: cat.label, tier: cat.tier, players: shuffle(usable.slice(0, FAMOUS_SHORTLIST)).slice(0, 4) });
    }
    if (groups.length === 4) return { groups, order: shuffle(groups.flatMap((g) => g.players)) };
  }
  throw new Error("Couldn't build a puzzle.");
}

// ---------- game flow ----------

const loadSave = () => loadDailySave(STORAGE_KEY);
const writeSave = (save) => writeDailySave(STORAGE_KEY, save);
const groupOf = (id) => play.groups.findIndex((g) => g.players.includes(id));

function reset(puzzle) {
  Object.assign(play, puzzle, {
    selected: new Set(), solved: [], guessed: [], guesses: [], mistakes: 0, found: 0, over: false, won: false,
  });
}

function startDaily() {
  play.mode = "daily";
  play.day = todayKey();
  play.number = dayNumber(play.day);
  reset(makePuzzle(rng(hash(`hoop-connections:${play.day}`))));

  const save = loadSave();
  const saved = save.history[play.day] || (save.progress?.day === play.day ? save.progress : null);
  if (saved) {
    Object.assign(play, {
      solved: saved.solved, guessed: saved.guessed, guesses: saved.guesses,
      mistakes: saved.mistakes, order: saved.order || play.order, found: saved.found ?? saved.solved.length,
    });
    if (save.history[play.day]) finish(saved.won, { restoring: true });
  }
  $("message").textContent = "";
  render();
}

function startPractice() {
  play.mode = "practice";
  play.day = null;
  play.number = null;
  reset(makePuzzle(Math.random));
  $("message").textContent = "";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggle(id) {
  if (play.over || play.solved.includes(groupOf(id))) return;
  if (play.selected.has(id)) play.selected.delete(id);
  else if (play.selected.size < 4) play.selected.add(id);
  render();
}

function submit() {
  if (play.over || play.selected.size !== 4) return;
  const picked = [...play.selected];
  const key = [...picked].sort().join(",");
  if (play.guessed.includes(key)) return say("You already tried those four.", "bad");
  play.guessed.push(key);
  play.guesses.push(picked.map((id) => play.groups[groupOf(id)].tier));

  const counts = [0, 1, 2, 3].map((g) => picked.filter((id) => groupOf(id) === g).length);
  const hit = counts.indexOf(4);
  if (hit >= 0) {
    play.solved.push(hit);
    play.selected.clear();
    say(`✓ ${play.groups[hit].label}`, "good");
    if (play.solved.length === 4) {
      finish(true);
      if (play.mistakes === 0) celebrate();
    }
  } else {
    play.mistakes++;
    say(counts.includes(3) ? "One away…" : "Not a group.", "bad");
    shake();
    if (play.mistakes >= MISTAKES) finish(false);
  }
  saveProgress();
  render();
}

function finish(won, { restoring = false } = {}) {
  play.over = true;
  play.won = won;
  play.selected.clear();
  if (!restoring) play.found = play.solved.length;
  // Reveal whatever's left, in difficulty order.
  for (let g = 0; g < 4; g++) if (!play.solved.includes(g)) play.solved.push(g);
  if (play.mode === "daily" && !restoring) {
    const save = loadSave();
    save.history[play.day] = {
      won, mistakes: play.mistakes, found: play.found, guesses: play.guesses, guessed: play.guessed,
      solved: play.solved, order: play.order,
    };
    save.progress = null;
    writeSave(save);
  }
}

function saveProgress() {
  if (play.mode !== "daily" || play.over) return;
  const save = loadSave();
  save.progress = {
    day: play.day, solved: play.solved, guessed: play.guessed, guesses: play.guesses,
    mistakes: play.mistakes, order: play.order,
  };
  writeSave(save);
}

function shuffleGrid() {
  const open = play.order.filter((id) => !play.solved.includes(groupOf(id)));
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  const solvedIds = play.order.filter((id) => play.solved.includes(groupOf(id)));
  play.order = [...solvedIds, ...open];
  saveProgress();
  render();
}

function shareText() {
  const title = play.mode === "daily" ? `Hoop Connections #${play.number}` : "Hoop Connections (practice)";
  const rows = play.guesses.map((tiers) => tiers.map((t) => TIER_EMOJI[t]).join("")).join("\n");
  return `${title}\n${rows}`;
}

async function share() {
  const text = shareText();
  await shareResult(text, $("share-msg"));
}

function say(text, kind = "") {
  $("message").textContent = text;
  $("message").className = `message ${kind}`;
}

function shake() {
  const grid = $("grid");
  grid.classList.remove("shake");
  void grid.offsetWidth;   // restart the animation
  grid.classList.add("shake");
}

// ---------- rendering ----------

function render() {
  const daily = play.mode === "daily";
  $("kicker").textContent = daily ? `Puzzle #${play.number} · ${formatDay(play.day)}` : "Practice puzzle";
  const state = $("state");
  state.className = "state";
  state.textContent = daily ? `Puzzle #${play.number}` : "Practice";
  if (play.over) state.classList.add(play.won ? "win" : "lose");

  $("solved").innerHTML = play.solved
    .map((g) => {
      const group = play.groups[g];
      const names = group.players.map((id) => (play.over ? playerLink(id) : escapeHtml(name(id)))).join(", ");
      return `
        <li class="cx-group t${group.tier}">
          <span class="cx-group-label">${escapeHtml(group.label)}</span>
          <span class="cx-group-names">${names}</span>
        </li>`;
    })
    .join("");

  const open = play.order.filter((id) => !play.solved.includes(groupOf(id)));
  $("grid").hidden = !open.length;
  $("grid").innerHTML = open
    .map((id) => `
      <button type="button" class="cx-tile ${play.selected.has(id) ? "selected" : ""}" data-id="${id}"
              aria-pressed="${play.selected.has(id)}">
        ${avatar(id, "xs")}
        <span>${escapeHtml(name(id))}</span>
      </button>`)
    .join("");

  const left = MISTAKES - play.mistakes;
  $("dots").innerHTML = Array.from({ length: MISTAKES }, (_, i) => `<i class="${i < left ? "on" : ""}"></i>`).join("");
  $("submit").disabled = play.over || play.selected.size !== 4;
  $("deselect").disabled = play.over || !play.selected.size;
  $("shuffle").disabled = play.over;
  $("bar").hidden = play.over;

  $("result").hidden = !play.over;
  if (play.over) renderResult();
  renderStats();
}

function renderResult() {
  const perfect = play.won && play.mistakes === 0;
  $("result").classList.toggle("lose", !play.won);
  $("result-kicker").textContent = play.won ? (perfect ? "Perfect" : "Solved") : "Out of mistakes";
  $("result-title").textContent = play.won
    ? perfect ? "No mistakes." : `${play.mistakes} mistake${play.mistakes === 1 ? "" : "s"}.`
    : `${play.found} of 4 groups found.`;
  $("result-grid").textContent = play.guesses.map((tiers) => tiers.map((t) => TIER_EMOJI[t]).join("")).join("\n");
  $("result-text").textContent = "Colors, easiest to hardest: 🟩 colleges · 🟨 teams and awards · 🟧 career facts · 🟥 names.";
  $("share-msg").textContent = "";
  $("practice").textContent = play.mode === "daily" ? "Practice puzzle" : "Another practice puzzle";
  $("next").hidden = play.mode !== "daily";
  updateCountdown();
}

function updateCountdown() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(0, Math.round((midnight - now) / 60000));
  $("next").textContent = `Next puzzle in ${Math.floor(mins / 60)}h ${mins % 60}m.`;
  if (play.mode === "daily" && play.day && play.day !== todayKey()) startDaily();
}

function renderStats() {
  const save = loadSave();
  const history = Object.values(save.history);
  $("stats").hidden = !history.length;
  if (!history.length) return;
  $("st-played").textContent = history.length;
  $("st-win").textContent = Math.round((100 * history.filter((h) => h.won).length) / history.length);
  // A streak here counts days in a row you solved it.
  const wins = Object.fromEntries(Object.entries(save.history).filter(([, h]) => h.won));
  $("st-streak").textContent = streaks(wins).current;
  $("st-perfect").textContent = history.filter((h) => h.won && h.mistakes === 0).length;
}

function formatDay(key) {
  const d = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ---------- wiring ----------

$("grid").addEventListener("click", (e) => {
  const tile = e.target.closest("[data-id]");
  if (tile) toggle(tile.dataset.id);
});
$("submit").addEventListener("click", submit);
$("deselect").addEventListener("click", () => { play.selected.clear(); render(); });
$("shuffle").addEventListener("click", shuffleGrid);
$("share").addEventListener("click", share);
$("practice").addEventListener("click", startPractice);
setInterval(updateCountdown, 30000);

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    startDaily();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
