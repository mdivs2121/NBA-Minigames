// Draft Day - a draft year and a pick number. Name who was taken. Four
// guesses; every miss reveals a clue (the team that picked, then college and
// position, then initials). A run keeps going until you miss one, and no
// player repeats in a run.

const SAVE_KEY = "dd-v1";   // { level, easy: { streak, best }, hard: { streak, best } }
const GUESSES = 4;

Object.assign(data, {
  picks: [],        // [id, year, pick, team, college, pos, games, easy]
  index: {},        // player id -> [name, from, to]
  labelToId: {},
});

const game = {
  level: loadSaved().level === "hard" ? "hard" : "easy",
  pick: null, misses: [], over: false, won: false,
  seen: new Set(),
};

// ---------- data ----------

async function loadData() {
  const [, file, index] = await Promise.all([loadCommon(), fetchJson("draft_day"), fetchJson("player/index")]);
  data.picks = file.picks;
  data.index = index;
  for (const [id] of file.picks) data.players[id] ||= { name: index[id][0] };
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

const initials = (n) => n.replace(/\b(Jr\.|Sr\.|II|III|IV)$/, "").trim().split(/\s+/).map((w) => `${w[0]}.`).join(" ");
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const inLevel = (p) => game.level === "hard" || p[7];

function newPick() {
  let pool = data.picks.filter((p) => inLevel(p) && !game.seen.has(p[0]));
  if (!pool.length) { game.seen.clear(); pool = data.picks.filter(inLevel); }
  game.pick = pool[Math.floor(Math.random() * pool.length)];
  game.seen.add(game.pick[0]);
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
  newPick();
}

function submitGuess() {
  if (game.over) return;
  const text = $("guess").value.trim();
  if (!text) return;
  const id = data.labelToId[text] ?? Object.entries(data.labelToId).find(([l]) => l.toLowerCase() === text.toLowerCase())?.[1];
  if (!id) return say("Pick a name from the list. Names shared by two players include their years.", "bad");
  if (game.misses.includes(id)) return say("You already guessed him.", "bad");
  $("guess").value = "";
  if (id === game.pick[0]) return finish(true);
  game.misses.push(id);
  if (game.misses.length >= GUESSES) return finish(false);
  // Where the guess actually went, if he was a first-round pick: a nudge.
  const his = data.picks.find((p) => p[0] === id);
  const where = his ? ` He went ${ordinal(his[2])} in ${his[1]}.` : "";
  say(`✕ Not ${data.index[id][0]}.${where} A new clue is showing.`, "bad");
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
const tries = () => (game.won ? "🟥".repeat(game.misses.length) + "🟩" : "🟥".repeat(GUESSES));

async function share() {
  const [id, year, pick] = game.pick;
  await shareResult(`Draft Day (${levelName()}) 🎤 ${year} #${pick}: ${data.index[id][0]}\n${tries()} · streak ${record().streak}`, $("share-msg"));
}

function saveImage() {
  const [id, year, pick] = game.pick;
  shareImage({
    title: "Draft Day",
    kicker: `${levelName()} · ${year} draft, pick ${pick}`,
    big: String(record().streak),
    grid: [tries()],
    lines: [`${game.won ? "Got" : "Missed"} ${data.index[id][0]} · best ${record().best}`],
  }, $("share-msg"));
}

// ---------- rendering ----------

function render() {
  const [id, year, pick, team, college, pos, games] = game.pick;
  for (const btn of document.querySelectorAll(".difficulty button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.level === game.level));
  }
  const r = record();
  $("streak").textContent = r.streak;
  $("best").textContent = r.best;
  $("season").textContent = `The ${year} NBA Draft`;
  $("answer").textContent = game.over ? data.index[id][0] : "Who went here?";
  $("left").textContent = GUESSES - game.misses.length;

  const state = $("state");
  state.className = "state";
  state.textContent = game.over ? (game.won ? "Got him" : "Missed") : `${GUESSES - game.misses.length} left`;
  if (game.over) state.classList.add(game.won ? "win" : "lose");

  $("line").innerHTML = `
    <span class="dd-year">${year}</span>
    <span class="dd-pick"><small>Pick</small>#${pick}</span>
    <span class="dd-round">${ordinal(pick)} overall · round 1</span>`;

  const clues = [
    `Picked by <b class="cp-badge" style="--team: ${teamColor(team)}">${team}</b>`,
    `${college ? `From <b>${escapeHtml(college)}</b>` : "Didn't play in college"} · ${escapeHtml(pos || "?")}`,
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
    $("result-title").innerHTML = playerLink(id, data.index[id][0]);
    $("result-text").textContent = `${ordinal(pick)} pick by ${team} in ${year}, then ${games.toLocaleString("en-US")} NBA games. ` +
      (game.won ? `Streak: ${r.streak}. Best: ${r.best}.` : `Run over. Best streak: ${r.best}.`);
    $("next").textContent = game.won ? "Next pick" : "New run";
    $("share-msg").textContent = "";
  }
}

// ---------- wiring ----------

$("guess-form").addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
$("give-up").addEventListener("click", () => !game.over && finish(false));
$("next").addEventListener("click", () => { newPick(); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);
for (const btn of document.querySelectorAll(".difficulty button")) {
  btn.addEventListener("click", () => setLevel(btn.dataset.level));
}

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    newPick();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
