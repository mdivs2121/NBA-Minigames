// Blind Résumé - two anonymous stat lines side by side. Pick the better one.
// Two modes, ten rounds each:
//   Careers: whole careers, judged by career Win Shares
//   Seasons: single seasons, judged by that season's Box Plus/Minus (BPM)
// Pairs are always similar positions with similar scoring, so the pick takes
// more than looking at points.

const ROUNDS = 10;
const PPG_WITHIN = 3;          // the two scored within 3 PPG of each other
// Same position or one step apart (PG vs SG, PF vs C), never a center vs a guard.
const POSITION_STEP = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
const similarPosition = (a, b) => Math.abs(POSITION_STEP[a.pos] - POSITION_STEP[b.pos]) <= 1;

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const signed = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

// rows: [label, the number to compare, how to show it, lower is better?]
const MODES = {
  careers: {
    file: "blind_resume",
    bestKey: "br-best",
    question: "Which career was worth more?",
    title: "Pick one. No names.",
    intro: "Both play similar positions and scored about the same, so look deeper. The answer is whoever finished with more career Win Shares.",
    metric: (p) => p.ws,
    show: (v) => `${v.toFixed(1)} Win Shares`,
    // One was worth at least 15% more Win Shares.
    clearWinner: (a, b) => Math.abs(a.ws - b.ws) / Math.max(a.ws, b.ws) >= 0.15,
    rows: [
      ["Seasons", (p) => p.seasons],
      ["Games", (p) => p.g, (v) => v.toLocaleString("en-US")],
      ["Points per game", (p) => p.ppg],
      ["Rebounds per game", (p) => p.rpg],
      ["Assists per game", (p) => p.apg],
      ["Steals per game", (p) => p.spg],
      ["Blocks per game", (p) => p.bpg],
      ["True shooting", (p) => p.tsPct, pct],
      ["All-Star picks", (p) => p.allStar],
      ["All-NBA teams", (p) => p.allNba],
      ["MVPs", (p) => p.mvp],
    ],
    subtitle: () => "",
  },
  seasons: {
    file: "blind_seasons",
    bestKey: "br-best-seasons",
    question: "Which season was better?",
    title: "One year each. No names.",
    intro: "Two single seasons, similar positions, similar scoring. The answer is the higher Box Plus/Minus (BPM): how many points per 100 possessions he added over an average player.",
    metric: (p) => p.bpm,
    show: (v) => `${signed(v)} BPM`,
    // At least 1.5 BPM apart.
    clearWinner: (a, b) => Math.abs(a.bpm - b.bpm) >= 1.5,
    rows: [
      ["Games", (p) => p.g],
      ["Minutes per game", (p) => p.mpg],
      ["Points per game", (p) => p.ppg],
      ["Rebounds per game", (p) => p.rpg],
      ["Assists per game", (p) => p.apg],
      ["Steals per game", (p) => p.spg],
      ["Blocks per game", (p) => p.bpg],
      ["Turnovers per game", (p) => p.tov, undefined, true],
      ["Field goal %", (p) => p.fgPct, pct],
      ["3-point %", (p) => p.threePct, pct],
      ["True shooting", (p) => p.tsPct, pct],
    ],
    subtitle: (p) => `${p.season} · ${p.teams.join("/")}`,
  },
};

Object.assign(data, {
  lines: {},        // mode -> stat lines, loaded when first needed
});

const game = {
  mode: savedMode(),
  round: 0,
  pair: null,       // [lineA, lineB]
  picked: null,     // 0 | 1 once chosen
  results: [],      // true/false per round
  used: new Set(),  // players already shown this game
  over: false,
};

const mode = () => MODES[game.mode];

// ---------- data ----------

function savedMode() {
  try { const saved = localStorage.getItem("br-mode"); if (saved in MODES) return saved; } catch {}
  return "careers";
}

// Each mode's stat lines load the first time that mode is played.
async function loadLines(name) {
  if (!data.lines[name]) {
    data.lines[name] = await fetchJson(MODES[name].file);
    for (const p of data.lines[name]) data.players[p.id] ||= { name: p.name };
  }
  return data.lines[name];
}

// ---------- game ----------

const random = (list) => list[Math.floor(Math.random() * list.length)];

// Two lines at similar positions with similar scoring and a clear winner.
function pickPair() {
  const lines = data.lines[game.mode];
  const { clearWinner } = mode();
  for (let tries = 0; tries < 3000; tries++) {
    const a = random(lines);
    if (game.used.has(a.id)) continue;
    const matches = lines.filter((b) =>
      b.id !== a.id && !game.used.has(b.id) &&
      similarPosition(a, b) &&
      Math.abs(b.ppg - a.ppg) <= PPG_WITHIN &&
      clearWinner(a, b));
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

async function setMode(name) {
  if (name === game.mode && game.pair) return;
  game.mode = name;
  try { localStorage.setItem("br-mode", name); } catch {}
  await loadLines(name);
  newGame();
}

function nextRound() {
  game.round++;
  game.pair = pickPair();
  game.picked = null;
  for (const p of game.pair) game.used.add(p.id);
  $("round-result").hidden = true;
  render();
}

const betterSide = () => (mode().metric(game.pair[0]) > mode().metric(game.pair[1]) ? 0 : 1);

function pick(side) {
  if (game.over || game.picked !== null) return;
  game.picked = side;
  const better = betterSide();
  const right = side === better;
  game.results.push(right);
  const [a, b] = [game.pair[better], game.pair[1 - better]];
  const { metric, show } = mode();
  const label = (p) => (game.mode === "seasons" ? `${p.name}'s ${p.season}` : p.name);
  $("verdict").textContent = `${right ? "✓ Right." : "✕ Not this time."} ${label(a)} (${show(metric(a))}) over ${label(b)} (${show(metric(b))}).`;
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
  if (score > loadBest()) try { localStorage.setItem(mode().bestKey, String(score)); } catch {}
  if (score >= 9) celebrate();
  $("round-result").hidden = true;
  render();
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function loadBest() {
  try { return Number(localStorage.getItem(mode().bestKey)) || 0; } catch { return 0; }
}

const emoji = () => game.results.map((r) => (r ? "🟩" : "🟥")).join("");
const modeName = () => (game.mode === "seasons" ? "Seasons" : "Careers");

async function share() {
  const score = game.results.filter(Boolean).length;
  await shareResult(`Blind Résumé 📋 ${modeName()} ${score}/${ROUNDS}\n${emoji()}`, $("share-msg"));
}

function saveImage() {
  const score = game.results.filter(Boolean).length;
  shareImage({
    title: "Blind Résumé",
    kicker: `${modeName()} · ${mode().question}`,
    big: `${score}/${ROUNDS}`,
    grid: [emoji()],
    lines: [`Best ever: ${Math.max(loadBest(), score)}/${ROUNDS}`],
  }, $("share-msg"));
}

// ---------- rendering ----------

function render() {
  const m = mode();
  for (const btn of document.querySelectorAll(".difficulty button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.mode === game.mode));
  }
  $("question").textContent = m.question;
  $("title").textContent = m.title;
  $("intro").textContent = m.intro;

  const score = game.results.filter(Boolean).length;
  $("round").textContent = `${Math.min(game.round, ROUNDS)}/${ROUNDS}`;
  $("score").textContent = score;
  const state = $("state");
  state.className = "state";
  state.textContent = game.over ? `${score}/${ROUNDS}` : `Best: ${loadBest()}/${ROUNDS}`;
  if (game.over && score >= 7) state.classList.add("win");

  const revealed = game.picked !== null;
  const better = betterSide();
  game.pair.forEach((p, side) => {
    const other = game.pair[1 - side];
    const card = $(side ? "card-b" : "card-a");
    const letter = side ? "B" : "A";
    const sub = revealed ? m.subtitle(p) : "";
    card.disabled = revealed || game.over;
    card.className = `br-card ${revealed ? (side === better ? "better" : "worse") : ""} ${revealed && side === game.picked ? "picked" : ""}`;
    card.innerHTML = `
      <span class="br-who">
        ${revealed ? avatar(p.id, "md") : `<span class="br-mystery">${letter}</span>`}
        <span class="br-name">${revealed ? escapeHtml(p.name) : `Player ${letter}`}<small>${p.pos}${sub ? ` · ${escapeHtml(sub)}` : ""}</small></span>
      </span>
      <span class="br-rows">
        ${m.rows.map(([label, get, show = (v) => v, lowerBetter = false]) => {
          const mine = get(p), theirs = get(other);
          const edge = mine != null && theirs != null && (lowerBetter ? mine < theirs : mine > theirs);
          return `<span class="br-row ${edge ? "edge" : ""}"><span>${label}</span><b>${mine == null ? "–" : show(mine)}</b></span>`;
        }).join("")}
      </span>
      ${revealed ? `<span class="br-ws">${m.show(m.metric(p))}</span>` : `<span class="br-take">Take Player ${letter}</span>`}`;
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
    $("result-text").textContent = `${modeName()} mode. Your best: ${Math.max(loadBest(), score)}/${ROUNDS}. Green rows marked each player's edge in that stat.`;
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
for (const btn of document.querySelectorAll(".difficulty button")) {
  btn.addEventListener("click", () => setMode(btn.dataset.mode).catch(showLoadError));
}
document.addEventListener("keydown", (e) => {
  if (game.over || $("game").hidden) return;
  if (game.picked === null && (e.key === "a" || e.key === "ArrowLeft")) pick(0);
  if (game.picked === null && (e.key === "b" || e.key === "ArrowRight")) pick(1);
});

// Player names first: loadCommon() replaces data.players, so the mode's
// names have to be added after it finishes.
loadCommon()
  .then(() => loadLines(game.mode))
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    newGame();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
