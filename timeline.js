// Timeline - five moments from NBA history (award wins, #1 picks, titles,
// first All-Star picks). Put them in order, oldest on top. A perfect order
// scores a point; anything less costs one of three lives.

const SAVE_KEY = eraKey("tl-v1");   // { level, easy: { best }, hard: { best } }
const LIVES = 3;
const PER_ROUND = 5;
const MIN_GAP = { easy: 4, hard: 1 };   // years between any two events in a round

Object.assign(data, { events: [] });   // [text, year, when, player id, team, player name]

const game = {
  level: loadSaved().level === "hard" ? "hard" : "easy",
  round: 0, streak: 0, lives: LIVES,
  events: [],       // this round's events, as indexes into data.events
  order: [],        // the player's order
  locked: false, result: null,
  seen: new Set(),  // events already used this run
};

// ---------- data ----------

async function loadData() {
  const [, file] = await Promise.all([loadCommon(), fetchJson("timeline")]);
  // Modern tab: from 2004 on, and only modern players' moments.
  data.events = file.events.filter(([, year, , pid]) => !MODERN || (year >= MODERN_DRAFT + 1 && (!pid || isModern(pid))));
  for (const [, , , pid, , n] of file.events) if (pid) data.players[pid] ||= { name: n };
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}

function writeSaved(saved) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch {}
}

// ---------- game ----------

// Five unseen events, from different years at least MIN_GAP apart, about five different players.
function pickRound() {
  const gap = MODERN && game.level === "easy" ? 3 : MIN_GAP[game.level];   // modern years are closer together
  for (let attempt = 0; attempt < 500; attempt++) {
    if (game.seen.size > data.events.length - 40) game.seen.clear();
    const pool = data.events.map((e, i) => i).filter((i) => !game.seen.has(i));
    const chosen = [];
    for (const i of pool.sort(() => Math.random() - 0.5)) {
      const [, year, , pid] = data.events[i];
      if (chosen.some((j) => Math.abs(data.events[j][1] - year) < gap || (pid && data.events[j][3] === pid))) continue;
      chosen.push(i);
      if (chosen.length === PER_ROUND) return chosen;
    }
  }
  throw new Error("Couldn't build a round.");
}

function newRound() {
  game.round++;
  game.events = pickRound();
  for (const i of game.events) game.seen.add(i);
  game.order = [...game.events];
  game.locked = false;
  game.result = null;
  render();
}

function newRun() {
  Object.assign(game, { round: 0, streak: 0, lives: LIVES, seen: new Set() });
  newRound();
}

function setLevel(level) {
  game.level = level;
  const saved = loadSaved();
  saved.level = level;
  writeSaved(saved);
  newRun();
}

function move(from, to) {
  if (game.locked || to < 0 || to >= PER_ROUND) return;
  const [id] = game.order.splice(from, 1);
  game.order.splice(to, 0, id);
}

const truth = () => [...game.events].sort((a, b) => data.events[a][1] - data.events[b][1]);

function lockIn() {
  if (game.locked) return;
  game.locked = true;
  const answer = truth();
  const off = game.order.map((i, at) => Math.abs(answer.indexOf(i) - at));
  const perfect = off.every((d) => d === 0);
  game.result = { perfect, exact: off.filter((d) => d === 0).length, emoji: off.map((d) => (d === 0 ? "🟩" : d === 1 ? "🟨" : "🟥")).join("") };
  if (perfect) game.streak++;
  else game.lives--;
  const saved = loadSaved();
  const record = (saved[game.level] ||= { best: 0 });
  const newBest = game.streak > record.best;
  record.best = Math.max(record.best, game.streak);
  writeSaved(saved);
  game.result.newBest = newBest && game.lives === 0;
  if (perfect) celebrate();
  render();
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- sharing ----------

const levelName = () => (game.level === "hard" ? "Hard" : "Easy");

async function share() {
  const text = game.lives === 0
    ? `Timeline (${levelName()}) ⏳ ${game.streak} perfect round${game.streak === 1 ? "" : "s"} in ${game.round}`
    : `Timeline (${levelName()}) ⏳ Round ${game.round}: ${game.result.emoji} · ${game.streak} perfect so far`;
  await shareResult(text, $("share-msg"));
}

function saveImage() {
  shareImage({
    title: "Timeline",
    kicker: `${levelName()} · round ${game.round}`,
    big: String(game.streak),
    grid: [game.result.emoji],
    lines: [`perfect round${game.streak === 1 ? "" : "s"} · ${"❤️".repeat(game.lives) || "out of lives"}`],
  }, $("share-msg"));
}

// ---------- rendering ----------

function render() {
  const saved = loadSaved();
  for (const btn of document.querySelectorAll(".difficulty button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.level === game.level));
  }
  $("streak").textContent = game.streak;
  $("lives").textContent = "❤️".repeat(game.lives) + "🖤".repeat(LIVES - game.lives);
  $("round-label").textContent = `Round ${game.round}`;
  const best = saved[game.level]?.best || 0;
  const state = $("state");
  state.className = "state";
  state.textContent = game.lives === 0 ? "Out of lives" : `Best: ${best}`;
  if (game.lives === 0) state.classList.add("lose");

  renderEvents();
  $("lock").hidden = game.locked;
  $("tip").hidden = game.locked;
  $("result").hidden = !game.locked;
  if (game.locked) {
    const { perfect, exact, emoji, newBest } = game.result;
    const over = game.lives === 0;
    $("result").classList.toggle("lose", !perfect);
    $("result-kicker").textContent = perfect ? "Perfect order" : over ? "Out of lives" : `${exact} of ${PER_ROUND} in the right spot`;
    $("result-title").textContent = over ? `${game.streak} perfect` : perfect ? "+1" : "−1 life";
    $("result-emoji").textContent = emoji;
    $("result-text").textContent = over
      ? `${newBest ? "New best! " : ""}${game.streak} perfect round${game.streak === 1 ? "" : "s"} out of ${game.round} on ${levelName()}. Best: ${best}.`
      : `${perfect ? "Nailed it." : `${game.lives} ${game.lives === 1 ? "life" : "lives"} left.`} The years are on each row.`;
    $("next").textContent = over ? "New run" : "Next round";
    $("share-msg").textContent = "";
  }
}

function renderEvents() {
  const answer = game.locked ? truth() : null;
  $("events").innerHTML = game.order
    .map((i, at) => {
      const [text, , when, pid, team] = data.events[i];
      const off = answer ? Math.abs(answer.indexOf(i) - at) : null;
      const cls = off === null ? "" : off === 0 ? "hit" : off === 1 ? "near" : "miss";
      const pic = pid ? avatar(pid, "md") : `<span class="tl-badge" style="--team: ${teamColor(team)}">${team}</span>`;
      const right = game.locked
        ? `<span class="truth">${off === 0 ? "✓" : `#${answer.indexOf(i) + 1}`}</span>`
        : `<span class="arrows">
             <button type="button" class="arrow" data-move="${at},${at - 1}" aria-label="Move up" ${at === 0 ? "disabled" : ""}>▲</button>
             <button type="button" class="arrow" data-move="${at},${at + 1}" aria-label="Move down" ${at === PER_ROUND - 1 ? "disabled" : ""}>▼</button>
           </span>`;
      return `
        <li class="rank-row tl-row ${cls}" data-index="${at}">
          <span class="rank-num">${at + 1}</span>
          ${game.locked ? "" : `<span class="handle" aria-hidden="true">⋮⋮</span>`}
          ${pic}
          <span class="rank-body">
            <span class="tl-text">${escapeHtml(text)}</span>
            ${game.locked ? `<span class="rank-sub">${escapeHtml(when)}</span>` : ""}
          </span>
          ${right}
        </li>`;
    })
    .join("");
}

// ---------- wiring ----------

enableDragSort($("events"), {
  canDrag: () => !game.locked,
  onMove: (from, to) => { move(from, to); renderEvents(); },
  onEnd: renderEvents,
});
$("events").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-move]");
  if (!btn) return;
  const [from, to] = btn.dataset.move.split(",").map(Number);
  move(from, to);
  renderEvents();
  const [up, down] = $("events").children[to].querySelectorAll(".arrow");
  const wanted = to < from ? up : down;
  (wanted.disabled ? (to < from ? down : up) : wanted).focus();
});
$("lock").addEventListener("click", lockIn);
$("next").addEventListener("click", () => {
  if (game.lives === 0) newRun();
  else newRound();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);
for (const btn of document.querySelectorAll(".difficulty button")) {
  btn.addEventListener("click", () => setLevel(btn.dataset.level));
}

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    newRun();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
