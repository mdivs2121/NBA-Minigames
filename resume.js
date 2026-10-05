// Blind Résumé - two anonymous stat lines side by side. Pick the better one.
// Three modes, ten rounds each:
//   Careers: whole careers, judged by career Win Shares
//   Seasons: single seasons, judged by that season's Box Plus/Minus (BPM)
//   Teams:   two teams from the same season, judged by win %
// Pairs are built so the answer takes more than one glance: similar
// positions and scoring for players, the same season for teams.

const ROUNDS = 10;
const PPG_WITHIN = 3;          // players: scored within 3 PPG of each other
// Same position or one step apart (PG vs SG, PF vs C), never a center vs a guard.
const POSITION_STEP = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
const similarPosition = (a, b) => Math.abs(POSITION_STEP[a.pos] - POSITION_STEP[b.pos]) <= 1;
const similarPlayers = (a, b) => similarPosition(a, b) && Math.abs(b.ppg - a.ppg) <= PPG_WITHIN;

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const pct1 = (v) => `${v.toFixed(1)}%`;         // already a percent, like 13.5
const signed = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
const record = (t) => `${t.w}–${t.l}`;

// A player card's top: a mystery letter, then his photo and name once revealed.
function playerHeader(p, revealed, letter, subtitle = "") {
  return `
    ${revealed ? avatar(p.id, "md") : `<span class="br-mystery">${letter}</span>`}
    <span class="br-name">${revealed ? escapeHtml(p.name) : `Player ${letter}`}<small>${p.pos}${subtitle ? ` · ${escapeHtml(subtitle)}` : ""}</small></span>`;
}

// Rows: { label, value(p), text(p)?, lower: lower is better?, neutral: no "better" side }
const MODES = {
  careers: {
    file: "blind_resume",
    bestKey: eraKey("br-best"),
    question: "Which career was worth more?",
    title: "Pick one. No names.",
    intro: "Both play similar positions and scored about the same, so look deeper. The answer is whoever finished with more career Win Shares.",
    metric: (p) => p.ws,
    show: (p) => `${p.ws.toFixed(1)} Win Shares`,
    // Similar players, and one was worth at least 15% more Win Shares.
    pairable: (a, b) => similarPlayers(a, b) && Math.abs(a.ws - b.ws) / Math.max(a.ws, b.ws) >= 0.15,
    header: (p, revealed, letter) => playerHeader(p, revealed, letter),
    label: (p) => p.name,
    rows: [
      { label: "Seasons", value: (p) => p.seasons },
      { label: "Games", value: (p) => p.g, text: (p) => p.g.toLocaleString("en-US") },
      { label: "Points per game", value: (p) => p.ppg },
      { label: "Rebounds per game", value: (p) => p.rpg },
      { label: "Assists per game", value: (p) => p.apg },
      { label: "Steals per game", value: (p) => p.spg },
      { label: "Blocks per game", value: (p) => p.bpg },
      { label: "True shooting", value: (p) => p.tsPct, text: (p) => pct(p.tsPct) },
      { label: "All-Star picks", value: (p) => p.allStar },
      { label: "All-NBA teams", value: (p) => p.allNba },
      { label: "MVPs", value: (p) => p.mvp },
    ],
  },
  seasons: {
    file: "blind_seasons",
    bestKey: eraKey("br-best-seasons"),
    question: "Which season was better?",
    title: "One year each. No names.",
    intro: "Two single seasons, similar positions, similar scoring. The answer is the higher Box Plus/Minus (BPM): how many points per 100 possessions he added over an average player.",
    metric: (p) => p.bpm,
    show: (p) => `${signed(p.bpm)} BPM`,
    // Similar players, at least 1.5 BPM apart.
    pairable: (a, b) => similarPlayers(a, b) && Math.abs(a.bpm - b.bpm) >= 1.5,
    header: (p, revealed, letter) => playerHeader(p, revealed, letter, revealed ? `${p.season} · ${p.teams.join("/")}` : ""),
    label: (p) => `${p.name}'s ${p.season}`,
    rows: [
      { label: "Games", value: (p) => p.g },
      { label: "Minutes per game", value: (p) => p.mpg },
      { label: "Points per game", value: (p) => p.ppg },
      { label: "Rebounds per game", value: (p) => p.rpg },
      { label: "Assists per game", value: (p) => p.apg },
      { label: "Steals per game", value: (p) => p.spg },
      { label: "Blocks per game", value: (p) => p.bpg },
      { label: "Turnovers per game", value: (p) => p.tov, lower: true },
      { label: "Field goal %", value: (p) => p.fgPct, text: (p) => pct(p.fgPct) },
      { label: "3-point %", value: (p) => p.threePct, text: (p) => pct(p.threePct) },
      { label: "True shooting", value: (p) => p.tsPct, text: (p) => pct(p.tsPct) },
    ],
  },
  teams: {
    file: "blind_teams",
    bestKey: eraKey("br-best-teams"),
    question: "Which team won more?",
    title: "Same season. No names.",
    intro: "Two teams from the same season, shown by the Four Factors that decide games (shooting, turnovers, rebounding, free throws) on both ends. Records are hidden. Pick the one with the better win %.",
    metric: (t) => t.winPct,
    show: (t) => record(t),
    // Same season, 6 to 20 wins apart (as a share of games, so short seasons work too).
    pairable: (a, b) => a.season === b.season && Math.abs(a.winPct - b.winPct) >= 6 / 82 && Math.abs(a.winPct - b.winPct) <= 20 / 82,
    header: (t, revealed, letter) => `
      <span class="br-mystery br-team" style="--team: ${revealed ? teamColor(t.abbr) : "var(--surface-2)"}">${revealed ? t.abbr : letter}</span>
      <span class="br-name">${revealed ? escapeHtml(t.name) : `Team ${letter}`}<small>${t.season}${revealed ? ` · ${t.playoffs ? "Made the playoffs" : "Missed the playoffs"}` : ""}</small></span>`,
    label: (t) => `The ${t.name}`,
    rows: [
      { label: "Pace", value: (t) => t.pace, neutral: true },
      { label: "Average age", value: (t) => t.age, neutral: true },
      { label: "3-point attempt rate", value: (t) => t.threeRate, text: (t) => pct(t.threeRate), neutral: true },
      { label: "Effective FG%", value: (t) => t.efg, text: (t) => pct(t.efg) },
      { label: "Turnover %", value: (t) => t.tov, text: (t) => pct1(t.tov), lower: true },
      { label: "Offensive rebound %", value: (t) => t.orb, text: (t) => pct1(t.orb) },
      { label: "Free throws per shot", value: (t) => t.ftr, text: (t) => t.ftr.toFixed(3) },
      { label: "Opponent eFG%", value: (t) => t.oppEfg, text: (t) => pct(t.oppEfg), lower: true },
      { label: "Opponent turnover %", value: (t) => t.oppTov, text: (t) => pct1(t.oppTov) },
      { label: "Defensive rebound %", value: (t) => t.drb, text: (t) => pct1(t.drb) },
      ...[0, 1].map((i) => ({
        label: i ? "2nd scorer" : "Top scorer",
        value: (t) => t.top[i]?.ppg,
        text: (t) => (t.top[i] ? `${t.top[i].ppg} / ${t.top[i].rpg} / ${t.top[i].apg}` : "–"),
        neutral: true,
      })),
    ],
    footnote: "Scorer lines are points / rebounds / assists per game.",
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
  used: new Set(),  // players (or team seasons) already shown this game
  usedSeasons: new Set(),   // Teams mode: one pair per season per game
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
    const endYear = (season) => Number(String(season).slice(0, 4)) + 1;
    const lines = await fetchJson(MODES[name].file);
    // Modern tab: modern players (seasons from 2009-10 on), or teams from 2009-10 on.
    data.lines[name] = !MODERN ? lines
      : name === "teams" ? lines.filter((t) => endYear(t.season) >= MODERN_SEASON)
      : lines.filter((p) => inEra(p.id, name === "seasons" ? endYear(p.season) : null));
    if (name !== "teams") for (const p of data.lines[name]) data.players[p.id] ||= { name: p.name };
  }
  return data.lines[name];
}

// ---------- game ----------

const random = (list) => list[Math.floor(Math.random() * list.length)];

function pickPair() {
  const lines = data.lines[game.mode];
  const { pairable } = mode();
  const fresh = (x) => !game.used.has(x.id) && !(game.mode === "teams" && game.usedSeasons.has(x.season));
  for (let tries = 0; tries < 3000; tries++) {
    const a = random(lines);
    if (!fresh(a)) continue;
    const matches = lines.filter((b) => b.id !== a.id && fresh(b) && pairable(a, b));
    if (!matches.length) continue;
    const b = random(matches);
    return Math.random() < 0.5 ? [a, b] : [b, a];
  }
  throw new Error("Couldn't find a pair.");
}

function newGame() {
  Object.assign(game, { round: 0, results: [], used: new Set(), usedSeasons: new Set(), over: false });
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
  for (const p of game.pair) { game.used.add(p.id); game.usedSeasons.add(p.season); }
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
  const { show, label } = mode();
  const when = game.mode === "teams" ? ` in ${a.season}` : "";
  $("verdict").textContent = `${right ? "✓ Right." : "✕ Not this time."} ${label(a)} (${show(a)}) over ${label(b).replace(/^The /, "the ")} (${show(b)})${when}.`;
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
const modeName = () => ({ careers: "Careers", seasons: "Seasons", teams: "Teams" })[game.mode];

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
  $("footnote").textContent = m.footnote || "";
  $("footnote").hidden = !m.footnote;

  const score = game.results.filter(Boolean).length;
  $("round").textContent = `${Math.min(game.round, ROUNDS)}/${ROUNDS}`;
  $("score").textContent = score;
  const state = $("state");
  state.className = "state";
  state.textContent = game.over ? `${score}/${ROUNDS}` : `Best: ${loadBest()}/${ROUNDS}`;
  if (game.over && score >= 7) state.classList.add("win");

  const revealed = game.picked !== null;
  const better = betterSide();
  const noun = game.mode === "teams" ? "Team" : "Player";
  game.pair.forEach((p, side) => {
    const other = game.pair[1 - side];
    const card = $(side ? "card-b" : "card-a");
    const letter = side ? "B" : "A";
    card.disabled = revealed || game.over;
    card.className = `br-card ${revealed ? (side === better ? "better" : "worse") : ""} ${revealed && side === game.picked ? "picked" : ""}`;
    card.innerHTML = `
      <span class="br-who">${m.header(p, revealed, letter)}</span>
      <span class="br-rows">
        ${m.rows.map((row) => {
          const mine = row.value(p), theirs = row.value(other);
          const edge = !row.neutral && mine != null && theirs != null && (row.lower ? mine < theirs : mine > theirs);
          const text = mine == null ? "–" : row.text ? row.text(p) : mine;
          return `<span class="br-row ${edge ? "edge" : ""}"><span>${row.label}</span><b>${text}</b></span>`;
        }).join("")}
      </span>
      ${game.mode === "teams" && revealed ? `<span class="br-scorers">${p.top.map((s) => escapeHtml(s.name)).join(", ")}</span>` : ""}
      ${revealed ? `<span class="br-ws">${m.show(p)}</span>` : `<span class="br-take">Take ${noun} ${letter}</span>`}`;
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
    $("result-text").textContent = `${modeName()} mode. Your best: ${Math.max(loadBest(), score)}/${ROUNDS}. Green rows marked the better number in each stat.`;
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
