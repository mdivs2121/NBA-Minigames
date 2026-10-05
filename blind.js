// Blind Draft - build a starting five from anonymous player-seasons. Each
// round is one position with four real seasons of similar scoring. Pick one;
// at the end the names (and hidden Win Shares) are revealed. Your score is
// your team's Win Shares as a share of the best five you could have drafted.

const SAVE_KEY = eraKey("bd-v1");   // { played, best, perfect }
const ROUNDS = [["PG", "Point guard"], ["SG", "Shooting guard"], ["SF", "Small forward"], ["PF", "Power forward"], ["C", "Center"]];
const OPTIONS = 4;
const PPG_RANGE = 3;      // every option scores within 3 PPG of the first
const MIN_WS_GAP = 0.8;   // options' Win Shares differ by at least this much, so there's a clear best

Object.assign(data, {
  seasons: [],       // [id, season, pos, g, mpg, ppg, rpg, apg, spg, bpg, ts, three, ws]
  byPos: {},
  index: {},
});

const game = { round: 0, rounds: [], picks: [], over: false };

// ---------- data ----------

async function loadData() {
  const [, file, index] = await Promise.all([loadCommon(), fetchJson("blind_draft"), fetchJson("player/index")]);
  data.seasons = file.seasons.filter((s) => inEra(s[0], s[1]));
  data.index = index;
  for (const s of data.seasons) {
    (data.byPos[s[2]] ||= []).push(s);
    data.players[s[0]] ||= { name: index[s[0]][0] };
  }
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}

function writeSaved(saved) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch {}
}

// ---------- drafting ----------

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const ws = (s) => s[12];

// Four seasons at one position: similar scoring, clearly different Win Shares,
// four different players nobody else in this draft is using.
function makeRound(pos, used) {
  const pool = data.byPos[pos];
  for (let attempt = 0; attempt < 400; attempt++) {
    const anchor = pick(pool);
    if (used.has(anchor[0])) continue;
    const chosen = [anchor];
    const near = pool.filter((s) => Math.abs(s[5] - anchor[5]) <= PPG_RANGE).sort(() => Math.random() - 0.5);
    for (const s of near) {
      if (used.has(s[0]) || chosen.some((c) => c[0] === s[0] || Math.abs(ws(c) - ws(s)) < MIN_WS_GAP)) continue;
      chosen.push(s);
      if (chosen.length === OPTIONS) break;
    }
    if (chosen.length === OPTIONS) {
      for (const c of chosen) used.add(c[0]);
      return chosen.sort(() => Math.random() - 0.5);
    }
  }
  throw new Error("Couldn't build a round.");
}

function newDraft() {
  const used = new Set();
  Object.assign(game, { round: 0, picks: [], over: false, rounds: ROUNDS.map(([pos]) => makeRound(pos, used)) });
  render();
}

function choose(i) {
  if (game.over) return;
  game.picks.push(i);
  game.round++;
  if (game.round === ROUNDS.length) return finish();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- scoring ----------

const mine = () => game.picks.map((p, r) => game.rounds[r][p]);
const bestOf = (round) => round.reduce((a, b) => (ws(b) > ws(a) ? b : a));
const totalWs = (list) => list.reduce((sum, s) => sum + ws(s), 0);
// Rank of your pick in its round: 0 = the best season, 3 = the worst.
const rankInRound = (r) => [...game.rounds[r]].sort((a, b) => ws(b) - ws(a)).indexOf(game.rounds[r][game.picks[r]]);
const RANK_EMOJI = ["🟩", "🟨", "🟧", "🟥"];

function score() {
  const best = totalWs(game.rounds.map(bestOf));
  return Math.max(0, Math.round((100 * totalWs(mine())) / best));
}

function finish() {
  game.over = true;
  const saved = loadSaved();
  const s = score();
  saved.played = (saved.played || 0) + 1;
  saved.best = Math.max(saved.best || 0, s);
  if (s === 100) saved.perfect = (saved.perfect || 0) + 1;
  writeSaved(saved);
  if (s === 100) celebrate({ big: true });
  else if (s >= 85) celebrate();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- sharing ----------

const emoji = () => game.picks.map((p, r) => RANK_EMOJI[rankInRound(r)]).join("");

async function share() {
  await shareResult(`Blind Draft 🙈 ${score()}/100\n${emoji()} · ${totalWs(mine()).toFixed(1)} Win Shares`, $("share-msg"));
}

function saveImage() {
  shareImage({
    title: "Blind Draft",
    kicker: "Starting five, no names",
    big: `${score()}/100`,
    grid: [emoji()],
    lines: [`${totalWs(mine()).toFixed(1)} Win Shares`],
  }, $("share-msg"));
}

// ---------- rendering ----------

const seasonText = (s) => `${s - 1}-${String(s).slice(-2)}`;
const decade = (s) => `${Math.floor((s - 1) / 10) * 10}s`;

function statCard(s, i) {
  const [, season, , g, mpg, ppg, rpg, apg, spg, bpg, ts, three] = s;
  const cell = (label, value) => `<div><b>${value ?? "–"}</b><span>${label}</span></div>`;
  return `
    <button type="button" class="bd-card" data-pick="${i}" style="animation-delay: ${i * 0.05}s">
      <span class="bd-tag">${"ABCD"[i]} · the ${decade(season)}</span>
      <span class="bd-big">${cell("PPG", ppg.toFixed(1))}${cell("RPG", rpg.toFixed(1))}${cell("APG", apg.toFixed(1))}</span>
      <span class="bd-small">${cell("SPG", spg.toFixed(1))}${cell("BPG", bpg.toFixed(1))}${cell("TS%", ts)}${cell("3P%", three)}${cell("G", g)}${cell("MPG", mpg.toFixed(1))}</span>
    </button>`;
}

function render() {
  const saved = loadSaved();
  const state = $("state");
  state.className = "state";
  state.textContent = game.over ? `${score()}/100` : saved.best ? `Best: ${saved.best}/100` : `Pick ${game.round + 1} of 5`;
  if (game.over && score() >= 85) state.classList.add("win");

  $("lineup").innerHTML = ROUNDS.map(([pos], r) => {
    const s = game.picks[r] != null ? game.rounds[r][game.picks[r]] : null;
    const body = !s ? `<span class="bd-empty">${r === game.round && !game.over ? "Picking…" : "–"}</span>`
      : game.over ? `${avatar(s[0], "xs")}<span>${escapeHtml(data.index[s[0]][0])}</span>`
      : `<span>${s[5].toFixed(1)} PPG</span>`;
    return `<li class="${s ? "filled" : ""} ${r === game.round && !game.over ? "current" : ""}"><b>${pos}</b>${body}</li>`;
  }).join("");

  $("drafting").hidden = game.over;
  if (!game.over) {
    const [pos, label] = ROUNDS[game.round];
    $("round").textContent = `Round ${game.round + 1} of ${ROUNDS.length} · ${pos}`;
    $("title").textContent = `Pick your ${label.toLowerCase()}.`;
    $("options").innerHTML = game.rounds[game.round].map(statCard).join("");
  }

  $("result").hidden = !game.over;
  $("reveal").hidden = !game.over;
  if (game.over) {
    const s = score();
    $("result").classList.toggle("lose", s < 60);
    $("result-kicker").textContent = s === 100 ? "Perfect draft" : s >= 85 ? "Front office material" : s >= 60 ? "Playoff team" : "Lottery bound";
    $("result-title").textContent = `${s}/100`;
    $("result-emoji").textContent = emoji();
    $("result-text").textContent = `Your five combined for ${totalWs(mine()).toFixed(1)} Win Shares. The best possible five had ${totalWs(game.rounds.map(bestOf)).toFixed(1)}. ` +
      `🟩 best pick in the round · 🟨 second · 🟧 third · 🟥 worst. Drafts played: ${saved.played || 0}, best ${saved.best || 0}/100.`;
    $("share-msg").textContent = "";
    $("reveal").innerHTML = ROUNDS.map(([pos, label], r) => {
      const ranked = [...game.rounds[r]].sort((a, b) => ws(b) - ws(a));
      return `
        <div class="bd-round">
          <span class="label">${label}</span>
          <ol>${ranked.map((x) => `
            <li class="${x === game.rounds[r][game.picks[r]] ? "mine" : ""}">
              ${avatar(x[0], "xs")}
              <span class="bd-who">${playerLink(x[0], data.index[x[0]][0])}<small>${seasonText(x[1])} · ${x[5].toFixed(1)} / ${x[6].toFixed(1)} / ${x[7].toFixed(1)}</small></span>
              <b>${ws(x).toFixed(1)} WS</b>
            </li>`).join("")}
          </ol>
        </div>`;
    }).join("");
  }
}

// ---------- wiring ----------

$("options").addEventListener("click", (e) => {
  const card = e.target.closest("[data-pick]");
  if (card) choose(Number(card.dataset.pick));
});
document.addEventListener("keydown", (e) => {
  const i = "abcd".indexOf(e.key.toLowerCase());
  if (i >= 0 && !game.over && !e.target.closest("input, textarea") && !$("game").hidden && !document.querySelector("dialog[open]")) choose(i);
});
$("again").addEventListener("click", () => { newDraft(); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    newDraft();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
