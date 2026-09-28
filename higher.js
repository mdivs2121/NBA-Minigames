// Higher or Lower - two players, one career stat. Does the right one have
// more or fewer? Each round brings a new stat, the right player slides over
// to the left, and the gap between them gets smaller the longer you last.

const RECOGNIZABLE_PPG = 15;    // a player needs one 15+ PPG season (20+ games) to appear
const MIN_CAREER_GAMES = 100;   // enough games that per-game career stats mean something
const BEST_KEY = "hl-best";

const count = (v) => Math.round(v).toLocaleString("en-US");
const perGame = (v) => v.toFixed(1);

// more/fewer: the words on the buttons for this stat.
const CATEGORIES = [
  { stat: "pts", title: "Career points", format: count, more: "More", fewer: "Fewer" },
  { stat: "trb", title: "Career rebounds", format: count, more: "More", fewer: "Fewer" },
  { stat: "ast", title: "Career assists", format: count, more: "More", fewer: "Fewer" },
  { stat: "stl", title: "Career steals", format: count, more: "More", fewer: "Fewer" },
  { stat: "blk", title: "Career blocks", format: count, more: "More", fewer: "Fewer" },
  { stat: "x3p", title: "Career 3\u2011pointers made", format: count, more: "More", fewer: "Fewer" },
  { stat: "g", title: "Career games played", format: count, more: "More", fewer: "Fewer" },
  { stat: "trpDbl", title: "Career triple-doubles", format: count, more: "More", fewer: "Fewer" },
  { stat: "seasons", title: "Seasons played", format: count, more: "More", fewer: "Fewer" },
  { stat: "ppg", title: "Career points per game", format: perGame, more: "Higher", fewer: "Lower" },
  { stat: "rpg", title: "Career rebounds per game", format: perGame, more: "Higher", fewer: "Lower" },
  { stat: "apg", title: "Career assists per game", format: perGame, more: "Higher", fewer: "Lower" },
];

Object.assign(data, {
  career: {},       // playerId -> career totals from rank_stats.json, plus per-game
  pool: [],
});

const game = {
  left: null,       // playerId, value shown
  right: null,      // playerId, value hidden until you guess
  category: null,
  streak: 0,
  history: [],      // true/false per guess, for the share text
  busy: false,      // true while the reveal animation plays
  over: false,
};

// ---------- data ----------

async function loadData() {
  const [, stats] = await Promise.all([loadCommon(), fetchJson("rank_stats")]);
  for (const [id, s] of Object.entries(stats)) {
    const c = s.career;
    if (!c.g) continue;
    data.career[id] = { ...c, ppg: c.pts / c.g, rpg: c.trb / c.g, apg: c.ast / c.g };
    const scorer = Object.values(s.seasons).some((x) => x.ppg >= RECOGNIZABLE_PPG && x.g >= 20);
    if (scorer && c.g >= MIN_CAREER_GAMES && data.players[id]) data.pool.push(id);
  }
}

// ---------- game ----------

const random = (list) => list[Math.floor(Math.random() * list.length)];
const valueOf = (id, category) => data.career[id][category.stat] ?? 0;

// How far apart (as a share of the bigger value) the two players must be.
// 35% apart at the start, tightening to 6% by a streak of 15.
function minGap(streak) {
  return Math.max(0.06, 0.35 - streak * 0.02);
}

// A new stat and a new right-hand player for the current left player.
function nextRound() {
  const gap = minGap(game.streak);
  for (let tries = 0; tries < 400; tries++) {
    const category = random(CATEGORIES.filter((c) => c !== game.category));
    const right = random(data.pool);
    if (right === game.left) continue;
    const a = valueOf(game.left, category), b = valueOf(right, category);
    if (a === b) continue;
    // After many tries, accept any pair that isn't a tie.
    if (tries < 300 && Math.abs(a - b) / Math.max(a, b) < gap) continue;
    game.category = category;
    game.right = right;
    return;
  }
}

function newGame() {
  Object.assign(game, { left: random(data.pool), category: null, streak: 0, history: [], busy: false, over: false });
  nextRound();
  $("result").hidden = true;
  $("choices").hidden = false;
  render();
}

function guess(saysMore) {
  if (game.busy || game.over) return;
  game.busy = true;
  const a = valueOf(game.left, game.category), b = valueOf(game.right, game.category);
  const correct = saysMore === b > a;
  game.history.push(correct);

  revealRight(correct, () => {
    if (correct) {
      game.streak++;
      saveBest();
      game.left = game.right;
      nextRound();
      game.busy = false;
      render();
    } else {
      finish();
    }
  });
  renderNumbers();
}

// Count the hidden number up from zero, color the card, then carry on.
function revealRight(correct, done) {
  const card = $("right");
  const target = valueOf(game.right, game.category);
  const valueEl = card.querySelector(".hl-value");
  card.classList.remove("mystery");
  card.classList.add(correct ? "hit" : "miss");
  $("higher").disabled = $("lower").disabled = true;

  const start = performance.now(), duration = 700;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    valueEl.textContent = game.category.format(target * eased);
    if (t < 1) requestAnimationFrame(step);
    else setTimeout(done, correct ? 650 : 400);
  };
  requestAnimationFrame(step);
}

function finish() {
  game.over = true;
  game.busy = false;
  $("choices").hidden = true;
  const best = loadBest();
  $("result-title").textContent = `${game.streak} in a row`;
  $("result-emoji").textContent = shareEmoji();
  const a = valueOf(game.left, game.category), b = valueOf(game.right, game.category);
  $("result-text").textContent =
    `${name(game.right)} has ${game.category.format(b)} to ${name(game.left)}'s ${game.category.format(a)}. ` +
    (game.streak >= best && game.streak > 0 ? "That's a new best!" : `Your best is ${best}.`);
  $("share-msg").textContent = "";
  $("result").hidden = false;
  $("state").textContent = "Game over";
  $("state").className = "state lose";
  $("again").focus();
}

function shareEmoji() {
  return game.history.map((ok) => (ok ? "🟩" : "🟥")).join("");
}

async function share() {
  const text = `Higher or Lower 🏀\n${shareEmoji()}\n${game.streak} in a row`;
  try {
    await navigator.clipboard.writeText(text);
    $("share-msg").textContent = "Copied! Paste it in the group chat.";
  } catch {
    $("share-msg").textContent = text;
  }
}

function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}

function saveBest() {
  if (game.streak <= loadBest()) return;
  try { localStorage.setItem(BEST_KEY, String(game.streak)); } catch {}
}

// ---------- rendering ----------

function render() {
  const c = game.category;
  $("question").textContent = c.title;
  $("round").textContent = game.streak + 1;
  $("left").className = "hl-card";
  $("left").innerHTML = card(game.left, c.format(valueOf(game.left, c)));
  $("right").className = "hl-card mystery";
  $("right").innerHTML = card(game.right, "?");
  $("higher").textContent = `▲ ${c.more}`;
  $("lower").textContent = `▼ ${c.fewer}`;
  $("higher").disabled = $("lower").disabled = false;
  $("state").className = "state";
  $("state").textContent = game.streak ? `${game.streak} in a row` : "New game";
  renderNumbers();
}

function renderNumbers() {
  $("streak").textContent = game.streak;
  $("best").textContent = Math.max(loadBest(), game.streak);
}

// Just photo, name, and number: anything more (seasons, games) could give
// away the answer on some stats.
function card(id, value) {
  return `
    ${avatar(id, "hl")}
    <h2 class="hl-name">${escapeHtml(name(id))}</h2>
    <p class="hl-value">${value}</p>`;
}

// ---------- wiring ----------

$("higher").addEventListener("click", () => guess(true));
$("lower").addEventListener("click", () => guess(false));
$("again").addEventListener("click", newGame);
$("share").addEventListener("click", share);
document.addEventListener("keydown", (e) => {
  if (game.over || $("game").hidden) return;
  if (e.key === "ArrowUp") { e.preventDefault(); guess(true); }
  if (e.key === "ArrowDown") { e.preventDefault(); guess(false); }
});

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    newGame();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
