// Stat Line - one real season's numbers. Name the player who put them up.
// Four guesses; every miss reveals a clue (team, then age and position, then
// initials). A run keeps going until you miss one, and no player repeats.

const SAVE_KEY = eraKey("sl-v1");   // { level, easy: { streak, best }, hard: { streak, best } }
const GUESSES = 4;
const POS_NAMES = { PG: "point guard", SG: "shooting guard", SF: "small forward", PF: "power forward", C: "center" };

Object.assign(data, {
  lines: [],        // [id, season, team, age, pos, g, mpg, ppg, rpg, apg, spg, bpg, fg, three, ft, easy]
  index: {},        // player id -> [name, from, to]
  labelToId: {},
});

const game = {
  level: loadSaved().level === "hard" ? "hard" : "easy",
  line: null, misses: [], over: false, won: false,
  seen: new Set(),   // players already used this run
};

// ---------- data ----------

async function loadData() {
  const [, file, index] = await Promise.all([loadCommon(), fetchJson("stat_lines"), fetchJson("player/index")]);
  data.lines = file.lines.filter((l) => inEra(l[0], l[1]));   // Modern tab: 2009-10 on, 2003 class on
  data.index = index;
  for (const [id] of file.lines) data.players[id] ||= { name: index[id][0] };
  // Anyone can be guessed. Names shared by two players get their years.
  const counts = {};
  for (const [n] of Object.values(index)) counts[n] = (counts[n] || 0) + 1;
  for (const [id, [n, from, to]] of Object.entries(index)) {
    if (!from) continue;
    data.labelToId[counts[n] > 1 ? `${n} (${from} – ${to})` : n] = id;
  }
  $("all-players").innerHTML = Object.keys(data.labelToId).sort().map((l) => `<option value="${escapeHtml(l)}">`).join("");
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}

function writeSaved(saved) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch {}
}

const record = () => loadSaved()[game.level] || { streak: 0, best: 0 };

// ---------- game ----------

const seasonText = (s) => `${s - 1}-${String(s).slice(-2)}`;
const initials = (n) => n.replace(/\b(Jr\.|Sr\.|II|III|IV)$/, "").trim().split(/\s+/).map((w) => `${w[0]}.`).join(" ");

function newLine() {
  const pool = data.lines.filter((l) => (game.level === "hard" || l[15]) && !game.seen.has(l[0]));
  if (!pool.length) game.seen.clear();
  const choices = pool.length ? pool : data.lines.filter((l) => game.level === "hard" || l[15]);
  game.line = choices[Math.floor(Math.random() * choices.length)];
  game.seen.add(game.line[0]);
  Object.assign(game, { misses: [], over: false, won: false });
  $("guess").value = "";
  say("");
  render();
  $("guess").focus({ preventScroll: true });
}

function setLevel(level) {
  game.level = level;
  game.seen.clear();
  const saved = loadSaved();
  saved.level = level;
  writeSaved(saved);
  newLine();
}

function submitGuess() {
  if (game.over) return;
  const text = $("guess").value.trim();
  if (!text) return;
  const id = data.labelToId[text] ?? Object.entries(data.labelToId).find(([l]) => l.toLowerCase() === text.toLowerCase())?.[1];
  if (!id) return say("Pick a name from the list. Names shared by two players include their years.", "bad");
  if (game.misses.includes(id)) return say("You already guessed him.", "bad");
  $("guess").value = "";
  if (id === game.line[0]) return finish(true);
  game.misses.push(id);
  if (game.misses.length >= GUESSES) return finish(false);
  say(`✕ Not ${data.index[id][0]}. A new clue is showing.`, "bad");
  render();
}

function finish(won) {
  game.over = true;
  game.won = won;
  const saved = loadSaved();
  const r = (saved[game.level] ||= { streak: 0, best: 0 });
  r.streak = won ? r.streak + 1 : 0;
  r.best = Math.max(r.best, r.streak);
  writeSaved(saved);
  if (!won) game.seen.clear();
  if (won) celebrate();
  say("");
  render();
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function say(text, kind = "") {
  $("message").textContent = text;
  $("message").className = `message ${kind}`;
}

// ---------- sharing ----------

const levelName = () => (game.level === "hard" ? "Hard" : "Easy");

async function share() {
  const [id, season] = game.line;
  const tries = game.won ? "🟥".repeat(game.misses.length) + "🟩" : "🟥".repeat(GUESSES);
  const text = `Stat Line (${levelName()}) 📊 ${seasonText(season)} ${data.index[id][0]}\n${tries} · streak ${record().streak}`;
  await shareResult(text, $("share-msg"));
}

function saveImage() {
  const [id, season] = game.line;
  shareImage({
    title: "Stat Line",
    kicker: `${levelName()} · ${seasonText(season)}`,
    big: String(record().streak),
    grid: [game.won ? "🟥".repeat(game.misses.length) + "🟩" : "🟥".repeat(GUESSES)],
    lines: [`${game.won ? "Got" : "Missed"} ${data.index[id][0]} · best ${record().best}`],
  }, $("share-msg"));
}

// ---------- rendering ----------

function render() {
  const [id, season, team, age, pos, g, mpg, ppg, rpg, apg, spg, bpg, fg, three, ft] = game.line;
  for (const btn of document.querySelectorAll(".difficulty button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.level === game.level));
  }
  const r = record();
  $("streak").textContent = r.streak;
  $("best").textContent = r.best;
  $("season").textContent = `The ${seasonText(season)} season`;
  $("answer").textContent = game.over ? data.index[id][0] : "Whose season?";
  $("left").textContent = GUESSES - game.misses.length;

  const state = $("state");
  state.className = "state";
  state.textContent = game.over ? (game.won ? "Got him" : "Missed") : `${GUESSES - game.misses.length} left`;
  if (game.over) state.classList.add(game.won ? "win" : "lose");

  const stat = (label, value, big = false) => `<div class="sl-stat ${big ? "big" : ""}"><b>${value ?? "–"}</b><span>${label}</span></div>`;
  const one = (n) => n.toFixed(1);
  $("line").innerHTML = `
    <div class="sl-main">${stat("PPG", one(ppg), true)}${stat("RPG", one(rpg), true)}${stat("APG", one(apg), true)}</div>
    <div class="sl-rest">${stat("SPG", one(spg))}${stat("BPG", one(bpg))}${stat("FG%", fg)}${stat("3P%", three)}${stat("FT%", ft)}${stat("Games", g)}${stat("MPG", one(mpg))}</div>`;

  const clues = [
    `Played for <b class="cp-badge" style="--team: ${teamColor(team)}">${team}</b>`,
    `${age} years old · ${POS_NAMES[pos] || pos || "unknown position"}`,
    `Initials: <b>${escapeHtml(initials(data.index[id][0]))}</b>`,
  ];
  $("clues").innerHTML = clues
    .map((c, i) => {
      const open = game.over || i < game.misses.length;
      return `<li class="${open ? "open" : ""}"><span class="cp-clue-n">${i + 1}</span>${open ? c : "Locked"}</li>`;
    })
    .join("");
  $("misses").innerHTML = game.misses.map((m) => `<li>✕ ${escapeHtml(data.index[m][0])}</li>`).join("");

  $("guess-form").hidden = game.over;
  $("result").hidden = !game.over;
  if (game.over) {
    $("result").classList.toggle("lose", !game.won);
    $("result-kicker").textContent = game.won ? (game.misses.length ? `Got him in ${game.misses.length + 1}` : "First try") : "It was";
    $("result-photo").innerHTML = avatar(id, "md");
    tintResult(team);
    $("result-title").innerHTML = playerLink(id, data.index[id][0]);
    $("result-text").textContent = game.won
      ? `Streak: ${r.streak}. Best: ${r.best}.`
      : `${seasonText(game.line[1])} ${game.line[2]}. Run over. Best streak: ${r.best}.`;
    $("next").textContent = game.won ? "Next season" : "New run";
    $("share-msg").textContent = "";
  }
}

// ---------- wiring ----------

$("guess-form").addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
$("give-up").addEventListener("click", () => !game.over && finish(false));
$("next").addEventListener("click", () => { newLine(); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);
for (const btn of document.querySelectorAll(".difficulty button")) {
  btn.addEventListener("click", () => setLevel(btn.dataset.level));
}

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    newLine();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
