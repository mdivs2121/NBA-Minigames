// MVP Ballot - a season's top five MVP vote-getters, shuffled. Put them back
// in the order the voters had them. Scored like Rank the Five.

const BEST_KEY = eraKey("mvp-best");   // { "2015-16": 83, ... }

Object.assign(data, {
  races: {},        // "2015-16" -> five players, in real voting order
});

const game = {
  season: null,
  order: [],        // your ballot, playerIds top to bottom
  locked: false,
  result: null,
};

// ---------- data ----------

async function loadData() {
  const [, races] = await Promise.all([loadCommon(), fetchJson("mvp")]);
  const endYear = (s) => Number(String(s).slice(0, 4)) + 1;
  data.races = MODERN ? Object.fromEntries(Object.entries(races).filter(([s]) => endYear(s) >= MODERN_SEASON)) : races;
  for (const race of Object.values(races)) {
    for (const p of race) data.players[p.id] ||= { name: p.name };
  }
}

const race = () => data.races[game.season];
const entry = (id) => race().find((p) => p.id === id);
const answer = () => race().map((p) => p.id);

// ---------- game ----------

function startSeason(season) {
  game.season = season;
  game.locked = false;
  game.result = null;
  // Shuffle until it isn't already in the right order.
  do {
    game.order = answer().sort(() => Math.random() - 0.5);
  } while (game.order.every((id, i) => id === answer()[i]));
  $("season").value = season;
  try { history.replaceState(null, "", `#${season}`); } catch {}
  render();
}

function randomSeason() {
  const seasons = Object.keys(data.races).filter((s) => s !== game.season);
  startSeason(seasons[Math.floor(Math.random() * seasons.length)]);
}

function move(from, to) {
  if (game.locked || to < 0 || to > 4 || from === to) return;
  const [id] = game.order.splice(from, 1);
  game.order.splice(to, 0, id);
}

// Same as Rank the Five: 100 minus how far off each player was (max 12 spots).
function scoreOf(order, truth) {
  const off = order.map((id, i) => Math.abs(truth.indexOf(id) - i));
  const total = off.reduce((a, b) => a + b, 0);
  return {
    off,
    score: Math.round(100 * (1 - total / 12)),
    exact: off.filter((d) => d === 0).length,
    emoji: off.map((d) => (d === 0 ? "🟩" : d === 1 ? "🟨" : "🟥")).join(""),
  };
}

function lockIn() {
  if (game.locked) return;
  game.locked = true;
  game.result = scoreOf(game.order, answer());
  const best = loadBest();
  if (game.result.score > (best[game.season] ?? -1)) {
    best[game.season] = game.result.score;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch {}
  }
  if (game.result.score === 100) celebrate();
  render();
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch { return {}; }
}

async function share() {
  const { score, emoji } = game.result;
  const text = `MVP Ballot · ${game.season}\n${emoji} ${score}/100`;
  await shareResult(text, $("share-msg"));
}

// ---------- rendering ----------

function render() {
  $("title").textContent = `The ${game.season} MVP race`;
  const best = loadBest()[game.season];
  const state = $("state");
  state.className = "state";
  state.textContent = game.locked ? `${game.result.score}/100` : best != null ? `Best: ${best}/100` : game.season;
  if (game.locked && game.result.score >= 75) state.classList.add("win");

  renderBallot();
  $("lock").hidden = game.locked;
  $("tip").hidden = game.locked;
  $("result").hidden = !game.locked;
  if (game.locked) renderResult();
}

function renderBallot() {
  const truth = answer();
  $("ballot").innerHTML = game.order
    .map((id, i) => {
      const p = entry(id);
      const off = game.locked ? Math.abs(truth.indexOf(id) - i) : null;
      const cls = off === null ? "" : off === 0 ? "hit" : off === 1 ? "near" : "miss";
      const right = game.locked
        ? `<span class="value mvp-share">${Math.round(p.share * 100)}%<small> of vote</small></span>
           <span class="truth">${off === 0 ? "✓" : `#${truth.indexOf(id) + 1}`}</span>`
        : `<span class="arrows">
             <button type="button" class="arrow" data-move="${i},${i - 1}" aria-label="Move ${escapeHtml(p.name)} up" ${i === 0 ? "disabled" : ""}>▲</button>
             <button type="button" class="arrow" data-move="${i},${i + 1}" aria-label="Move ${escapeHtml(p.name)} down" ${i === 4 ? "disabled" : ""}>▼</button>
           </span>`;
      const record = p.record ? ` · ${p.record}` : "";
      return `
        <li class="rank-row ${cls}" data-index="${i}">
          <span class="rank-num">${i + 1}</span>
          ${game.locked ? "" : `<span class="handle" aria-hidden="true">⋮⋮</span>`}
          ${avatar(id, "md")}
          <span class="rank-body">
            <span class="rank-name">${game.locked ? playerLink(id, p.name) : escapeHtml(p.name)}</span>
            <span class="rank-sub">${p.teams.join(" / ")}${record} · ${p.ppg} PPG, ${p.rpg} RPG, ${p.apg} APG · ${p.ws} WS</span>
          </span>
          ${right}
        </li>`;
    })
    .join("");
}

function saveImage() {
  const { score, exact, emoji } = game.result;
  shareImage({
    title: "MVP Ballot",
    kicker: `The ${game.season} race`,
    big: `${score}/100`,
    grid: [emoji],
    lines: [`${exact} of 5 in the right spot`],
  }, $("share-msg"));
}

function renderResult() {
  const { score, exact, emoji } = game.result;
  const winner = race()[0];
  $("result").classList.toggle("lose", score < 40);
  $("result-kicker").textContent =
    score === 100 ? "Perfect ballot" : score >= 75 ? "You'd get a vote" : score >= 40 ? "Close enough" : "Ballot rejected";
  $("result-score").textContent = `${score}/100`;
  $("result-emoji").textContent = emoji;
  const firsts = winner.first ? ` with ${winner.first} first-place vote${winner.first === 1 ? "" : "s"}` : "";
  $("result-text").textContent =
    `${exact} of 5 in the right spot. ${winner.name} won${firsts}. ` +
    "🟩 right spot · 🟨 one off · 🟥 two or more off.";
  $("share-msg").textContent = "";
}

// ---------- wiring ----------

enableDragSort($("ballot"), {
  canDrag: () => !game.locked,
  onMove: (from, to) => { move(from, to); renderBallot(); },
  onEnd: renderBallot,
});
$("ballot").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-move]");
  if (!btn) return;
  const [from, to] = btn.dataset.move.split(",").map(Number);
  move(from, to);
  renderBallot();
  const [up, down] = $("ballot").children[to].querySelectorAll(".arrow");
  const wanted = to < from ? up : down;
  (wanted.disabled ? (to < from ? down : up) : wanted).focus();
});
$("season").addEventListener("change", (e) => startSeason(e.target.value));
$("random-season").addEventListener("click", randomSeason);
$("next").addEventListener("click", () => { randomSeason(); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("lock").addEventListener("click", lockIn);
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);

loadData()
  .then(() => {
    const seasons = Object.keys(data.races).sort().reverse();
    $("season").innerHTML = seasons.map((s) => `<option value="${s}">${s}</option>`).join("");
    $("status").hidden = true;
    $("game").hidden = false;
    // A link like mvp.html#2015-16 opens that race; otherwise pick one at random.
    const fromLink = decodeURIComponent(location.hash.slice(1));
    if (data.races[fromLink]) startSeason(fromLink);
    else randomSeason();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
