// Career Path - name the player from nothing but the teams he played for.
// Six guesses; every miss unlocks a clue (position and height, draft, career
// numbers, All-Star picks, initials).

const GUESSES = 6;
const EASY_POOL = 150;             // Easy picks from the 150 best-known players…
const EASY_SINCE = 2000;           // …who were still playing in 2000 or later
const SAVE_KEY = "cp-v1";          // { easy: { streak, best }, hard: { ... } }


Object.assign(data, {
  teams: {},        // abbreviation -> full name
  careers: [],      // players with a path
  pools: {},        // level -> careers
  index: {},        // every player's id -> [name, from, to], for guessing
  labelToId: {},
});

const game = {
  level: loadSaved().level || "easy",
  answer: null,     // one career
  misses: [],       // wrong player ids
  over: false,
  won: false,
};

// ---------- data ----------

async function loadData() {
  const [, cp, index] = await Promise.all([loadCommon(), fetchJson("career_path"), fetchJson("player/index")]);
  data.teams = cp.teams;
  data.careers = cp.players;
  data.index = index;
  for (const c of cp.players) data.players[c.id] ||= { name: c.name };
  const byFame = [...cp.players].filter((c) => c.path.at(-1)[2] >= EASY_SINCE).sort((a, b) => b.fame - a.fame);
  data.pools = { easy: byFame.slice(0, EASY_POOL), hard: cp.players };

  // Anyone can be guessed. Names shared by two players get their years.
  const counts = {};
  for (const [n] of Object.values(index)) counts[n] = (counts[n] || 0) + 1;
  const options = [];
  for (const [id, [n, from, to]] of Object.entries(index)) {
    if (!from) continue;   // never played
    const label = counts[n] > 1 ? `${n} (${from} – ${to})` : n;
    data.labelToId[label] = id;
    options.push(label);
  }
  options.sort();
  $("all-players").innerHTML = options.map((l) => `<option value="${escapeHtml(l)}">`).join("");
}

// ---------- saved streaks ----------

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}

function writeSaved(saved) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch {}
}

function record(level) {
  return { streak: 0, best: 0, ...(loadSaved()[level] || {}) };
}

// ---------- game ----------

// Nobody shows up twice in one run (a streak). The players seen this run are
// saved, so a reload doesn't bring one back; they clear when the run ends, or
// if someone somehow sees the whole pool.
function newCareer() {
  const pool = data.pools[game.level];
  const saved = loadSaved();
  const r = record(game.level);
  let seen = new Set(r.seen || []);
  let fresh = pool.filter((c) => !seen.has(c.id) && c !== game.answer);
  if (!fresh.length) {
    seen = new Set();
    fresh = pool.filter((c) => c !== game.answer);
  }
  const next = fresh[Math.floor(Math.random() * fresh.length)];
  seen.add(next.id);
  saved[game.level] = { ...r, seen: [...seen] };
  writeSaved(saved);
  Object.assign(game, { answer: next, misses: [], over: false, won: false });
  $("guess").value = "";
  $("result").hidden = true;
  $("guess-form").hidden = false;
  $("message").textContent = "";
  render();
  $("guess").focus({ preventScroll: true });
}

function setLevel(level) {
  game.level = level;
  const saved = loadSaved();
  saved.level = level;
  writeSaved(saved);
  newCareer();
}

function submitGuess() {
  if (game.over) return;
  const text = $("guess").value.trim();
  if (!text) return;
  const id = data.labelToId[text] ?? Object.entries(data.labelToId).find(([l]) => l.toLowerCase() === text.toLowerCase())?.[1];
  if (!id) return say("Pick a name from the list. Names shared by two players include their years.", "bad");
  if (game.misses.includes(id)) return say("You already guessed him.", "bad");
  $("guess").value = "";

  if (id === game.answer.id) return finish(true);
  game.misses.push(id);
  say(`✕ Not ${data.index[id][0]}.${game.misses.length < GUESSES ? " New clue unlocked." : ""}`, "bad");
  if (game.misses.length >= GUESSES) return finish(false);
  render();
}

function finish(won) {
  game.over = true;
  game.won = won;
  const saved = loadSaved();
  const r = record(game.level);
  r.streak = won ? r.streak + 1 : 0;
  r.best = Math.max(r.best, r.streak);
  if (!won) r.seen = [];   // the run is over, so the next one starts fresh
  saved[game.level] = r;
  writeSaved(saved);
  if (won && game.misses.length === 0) celebrate();
  say("");
  render();
}

function say(text, kind = "") {
  $("message").textContent = text;
  $("message").className = `message ${kind}`;
}

// ---------- clues ----------

function clues(c) {
  const ht = c.ht ? `${Math.floor(c.ht / 12)}′${c.ht % 12}″` : "height unknown";
  const pos = c.pos ? c.pos.split("-").map((p) => ({ G: "Guard", F: "Forward", C: "Center" })[p] || p).join("/") : "Position unknown";
  const draft = c.draft ? `Drafted in ${c.draft.year}, #${c.draft.pick} overall by ${c.draft.team}` : "Went undrafted";
  const words = c.name.replace(/\b(Jr|Sr|II|III|IV)\.?$/, "").trim().split(/\s+/);
  const initials = words.map((w) => `${w[0]}.`).join(" ");
  return [
    `${pos} · ${ht}`,
    draft,
    `Career: ${c.ppg} PPG, ${c.rpg} RPG, ${c.apg} APG`,
    c.allStars ? `${c.allStars}× All-Star` : "Never made an All-Star team",
    `Initials: ${initials}`,
  ];
}

// ---------- rendering ----------

function render() {
  for (const btn of document.querySelectorAll(".difficulty button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.level === game.level));
  }
  const r = record(game.level);
  $("streak").textContent = r.streak;
  $("best").textContent = r.best;

  const c = game.answer;
  const state = $("state");
  state.className = "state";
  state.textContent = game.over ? (game.won ? "Got him" : "Missed") : `${GUESSES - game.misses.length} guesses left`;
  if (game.over) state.classList.add(game.won ? "win" : "lose");

  $("answer").textContent = game.over ? c.name : "? ? ?";
  $("path").innerHTML = c.path
    .map(([team, from, to], i) => `
      <li style="--team: ${teamColor(team)}; animation-delay: ${i * 0.06}s">
        <span class="cp-badge">${team}</span>
        <span class="cp-team">${escapeHtml(data.teams[team] || team)}</span>
        <span class="cp-years">${from}–${String(to).slice(-2)}</span>
      </li>`)
    .join("");

  const all = clues(c);
  const unlocked = game.over ? all.length : game.misses.length;
  $("clues").innerHTML = all
    .map((text, i) => i < unlocked
      ? `<li class="open"><span class="cp-clue-n">${i + 1}</span>${escapeHtml(text)}</li>`
      : `<li><span class="cp-clue-n">${i + 1}</span>Unlocks after miss #${i + 1}</li>`)
    .join("");

  $("left").textContent = GUESSES - game.misses.length;
  $("misses").innerHTML = game.misses.map((id) => `<li>✕ ${escapeHtml(data.index[id][0])}</li>`).join("");
  $("guess-form").hidden = game.over;
  $("result").hidden = !game.over;
  if (game.over) renderResult();
}

function renderResult() {
  const c = game.answer;
  const tries = game.misses.length + 1;
  $("result").classList.toggle("lose", !game.won);
  $("result-kicker").textContent = game.won ? (tries === 1 ? "First try" : `Got it in ${tries}`) : "The answer";
  $("result-photo").innerHTML = avatar(c.id, "md");
  // Tint with the team he spent the longest with.
  tintResult([...c.path].sort((a, b) => (b[2] - b[1]) - (a[2] - a[1]))[0][0]);
  $("result-title").innerHTML = playerLink(c.id, c.name);
  const r = record(game.level);
  $("result-text").textContent = game.won
    ? `${r.streak > 1 ? `${r.streak} in a row. ` : ""}${c.path.length} stops, ${c.allStars ? `${c.allStars}× All-Star` : "no All-Star picks"}.`
    : `Streak reset. ${c.name} made ${c.path.length} stops.`;
  $("share-msg").textContent = "";
  $("next").focus({ preventScroll: true });
}

function shareBoxes() {
  return [...game.misses.map(() => "🟥"), ...(game.won ? ["🟩"] : [])].join("");
}

async function share() {
  const tries = game.won ? `${game.misses.length + 1}/${GUESSES}` : `X/${GUESSES}`;
  const text = `Career Path 🧭 ${tries}\n${shareBoxes()}\n${game.answer.path.map(([t]) => t).join(" → ")}`;
  await shareResult(text, $("share-msg"));
}

function saveImage() {
  shareImage({
    title: "Career Path",
    kicker: game.level === "easy" ? "Easy · stars" : "Hard · anyone",
    big: game.won ? `${game.misses.length + 1}/${GUESSES}` : `X/${GUESSES}`,
    grid: [shareBoxes()],
    lines: [game.answer.path.map(([t]) => t).join(" → ")],
  }, $("share-msg"));
}

// ---------- wiring ----------

$("guess-form").addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
$("give-up").addEventListener("click", () => finish(false));
$("next").addEventListener("click", () => { newCareer(); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);
for (const btn of document.querySelectorAll(".difficulty button")) {
  btn.addEventListener("click", () => setLevel(btn.dataset.level));
}

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    newCareer();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
