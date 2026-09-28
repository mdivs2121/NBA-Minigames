// Blind Résumé - two anonymous careers side by side. Pick the one that was
// worth more career Win Shares. Ten rounds a game.

const ROUNDS = 10;
const PPG_WITHIN = 3;          // the two players scored within 3 PPG of each other…
const MIN_WS_GAP = 0.15;       // …but one was worth at least 15% more Win Shares
// Same position or one step apart (PG vs SG, PF vs C), never a center vs a guard.
const POSITION_STEP = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
const similarPosition = (a, b) => Math.abs(POSITION_STEP[a.pos] - POSITION_STEP[b.pos]) <= 1;
const BEST_KEY = "br-best";

// [label, the number to compare, how to show it]
const ROWS = [
  ["Seasons", (p) => p.seasons],
  ["Games", (p) => p.g, (v) => v.toLocaleString("en-US")],
  ["Points per game", (p) => p.ppg],
  ["Rebounds per game", (p) => p.rpg],
  ["Assists per game", (p) => p.apg],
  ["Steals per game", (p) => p.spg],
  ["Blocks per game", (p) => p.bpg],
  ["True shooting", (p) => p.tsPct, (v) => `${(v * 100).toFixed(1)}%`],
  ["All-Star picks", (p) => p.allStar],
  ["All-NBA teams", (p) => p.allNba],
  ["MVPs", (p) => p.mvp],
];

Object.assign(data, {
  careers: [],
});

const game = {
  round: 0,
  pair: null,       // [careerA, careerB]
  picked: null,     // 0 | 1 once chosen
  results: [],      // true/false per round
  used: new Set(),  // players already shown this game
  over: false,
};

// ---------- data ----------

async function loadData() {
  const [, careers] = await Promise.all([loadCommon(), fetchJson("blind_resume")]);
  data.careers = careers;
  for (const c of careers) data.players[c.id] ||= { name: c.name };
}

// ---------- game ----------

const random = (list) => list[Math.floor(Math.random() * list.length)];

// Two careers at similar positions with similar scoring and a clear Win Shares winner.
function pickPair() {
  for (let tries = 0; tries < 2000; tries++) {
    const a = random(data.careers);
    if (game.used.has(a.id)) continue;
    const matches = data.careers.filter((b) =>
      b.id !== a.id && !game.used.has(b.id) &&
      similarPosition(a, b) &&
      Math.abs(b.ppg - a.ppg) <= PPG_WITHIN &&
      Math.abs(b.ws - a.ws) / Math.max(a.ws, b.ws) >= MIN_WS_GAP);
    if (!matches.length) continue;
    const b = random(matches);
    return Math.random() < 0.5 ? [a, b] : [b, a];
  }
  throw new Error("Couldn't find a pair.");
}

function newGame() {
  Object.assign(game, { round: 0, results: [], used: new Set(), over: false });
  $("result").hidden = true;
  nextRound();
}

function nextRound() {
  game.round++;
  game.pair = pickPair();
  game.picked = null;
  for (const c of game.pair) game.used.add(c.id);
  $("round-result").hidden = true;
  render();
}

function pick(side) {
  if (game.over || game.picked !== null) return;
  game.picked = side;
  const better = game.pair[0].ws > game.pair[1].ws ? 0 : 1;
  const right = side === better;
  game.results.push(right);
  const [a, b] = [game.pair[better], game.pair[1 - better]];
  $("verdict").textContent = `${right ? "✓ Right." : "✕ Not this time."} ${a.name} (${a.ws.toFixed(1)} Win Shares) over ${b.name} (${b.ws.toFixed(1)}).`;
  $("verdict").className = `message ${right ? "good" : "bad"}`;
  $("next").textContent = game.round === ROUNDS ? "See your score" : "Next round";
  $("round-result").hidden = false;
  render();
  $("next").focus({ preventScroll: true });
}

function advance() {
  if (game.round < ROUNDS) return nextRound();
  game.over = true;
  const score = game.results.filter(Boolean).length;
  const best = loadBest();
  if (score > best) try { localStorage.setItem(BEST_KEY, String(score)); } catch {}
  if (score >= 9) celebrate();
  $("round-result").hidden = true;
  render();
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}

const emoji = () => game.results.map((r) => (r ? "🟩" : "🟥")).join("");

async function share() {
  const score = game.results.filter(Boolean).length;
  await shareResult(`Blind Résumé 📋 ${score}/${ROUNDS}\n${emoji()}`, $("share-msg"));
}

function saveImage() {
  const score = game.results.filter(Boolean).length;
  shareImage({
    title: "Blind Résumé",
    kicker: "Which career was worth more?",
    big: `${score}/${ROUNDS}`,
    grid: [emoji()],
    lines: [`Best ever: ${Math.max(loadBest(), score)}/${ROUNDS}`],
  }, $("share-msg"));
}

// ---------- rendering ----------

function render() {
  const score = game.results.filter(Boolean).length;
  $("round").textContent = `${Math.min(game.round, ROUNDS)}/${ROUNDS}`;
  $("score").textContent = score;
  const state = $("state");
  state.className = "state";
  state.textContent = game.over ? `${score}/${ROUNDS}` : `Best: ${loadBest()}/${ROUNDS}`;
  if (game.over && score >= 7) state.classList.add("win");

  const revealed = game.picked !== null;
  const better = game.pair[0].ws > game.pair[1].ws ? 0 : 1;
  game.pair.forEach((c, side) => {
    const other = game.pair[1 - side];
    const card = $(side ? "card-b" : "card-a");
    card.disabled = revealed || game.over;
    card.className = `br-card ${revealed ? (side === better ? "better" : "worse") : ""} ${revealed && side === game.picked ? "picked" : ""}`;
    card.innerHTML = `
      <span class="br-who">
        ${revealed ? avatar(c.id, "md") : `<span class="br-mystery">${side ? "B" : "A"}</span>`}
        <span class="br-name">${revealed ? escapeHtml(c.name) : `Player ${side ? "B" : "A"}`}<small>${c.pos}</small></span>
      </span>
      <span class="br-rows">
        ${ROWS.map(([label, get, show = (v) => v]) => {
          const mine = get(c), theirs = get(other);
          const edge = mine != null && theirs != null && mine > theirs;
          return `<span class="br-row ${edge ? "edge" : ""}"><span>${label}</span><b>${mine == null ? "–" : show(mine)}</b></span>`;
        }).join("")}
      </span>
      ${revealed ? `<span class="br-ws">${c.ws.toFixed(1)} Win Shares</span>` : `<span class="br-take">Take Player ${side ? "B" : "A"}</span>`}`;
  });

  $("dots").innerHTML = Array.from({ length: ROUNDS }, (_, i) => {
    const r = game.results[i];
    return `<li class="${r === true ? "hit" : r === false ? "miss" : i === game.round - 1 ? "now" : ""}"></li>`;
  }).join("");

  $("result").hidden = !game.over;
  if (game.over) {
    $("result").classList.toggle("lose", score < 5);
    $("result-kicker").textContent = score >= 9 ? "Scout of the year" : score >= 7 ? "Sharp eye" : score >= 5 ? "Coin-flip territory" : "Back to the tape";
    $("result-title").textContent = `${score} of ${ROUNDS}`;
    $("result-emoji").textContent = emoji();
    $("result-text").textContent = `Your best: ${Math.max(loadBest(), score)}/${ROUNDS}. Green rows marked each player's edge in that stat.`;
    $("share-msg").textContent = "";
  }
}

// ---------- wiring ----------

$("card-a").addEventListener("click", () => pick(0));
$("card-b").addEventListener("click", () => pick(1));
$("next").addEventListener("click", advance);
$("again").addEventListener("click", () => { newGame(); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);
document.addEventListener("keydown", (e) => {
  if (game.over || $("game").hidden) return;
  if (game.picked === null && (e.key === "a" || e.key === "ArrowLeft")) pick(0);
  if (game.picked === null && (e.key === "b" || e.key === "ArrowRight")) pick(1);
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
