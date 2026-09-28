// Teammate Chain - the site gives you two players; you link them through
// teammates (same team, same season) in as few guesses as possible.

// A player can be one of the two starting players only if he averaged at
// least the level's minPpg in some season with MIN_GAMES or more games played.
const MIN_GAMES = 20;

// between  = players needed in the shortest chain
// hints    = show career info for the two starting players
// minPpg   = best-season scoring needed to be a starting player
// minLinks = (easy) how many different players must connect the two
const LEVELS = {
  easy:   { between: 1, hints: true,  minPpg: 16, minLinks: 5 },
  medium: { between: 2, hints: true,  minPpg: 10 },
  hard:   { between: 2, hints: false, minPpg: 10 },
};

// `data` comes from common.js (players, photos); this game adds the rest.
Object.assign(data, {
  graph: {},        // playerId -> [teammateId, ...]
  seasons: {},      // playerId -> [{ season, teams, stats }, ...] sorted by season
  labelToId: {},    // "LeBron James (2005-06 – 2025-26)" -> playerId
  idToLabel: {},
  pools: {},        // level -> playerIds eligible to be starting players
});

const game = {
  level: loadLevel(),
  start: null,
  target: null,
  chain: [],        // playerIds from start to the current end
  log: [],          // [{ id, hit }]
  guesses: 0,
  best: null,       // one shortest path, start -> target
  distToTarget: {}, // playerId -> teammate links to the target
  hint: null,       // the hint currently shown, for one chain end
  hintsUsed: 0,
  over: false,
};

// ---------- data ----------

// chain.json (from scripts/build_chain_data.py) numbers every player and
// stores teammates as gaps between sorted numbers; unpack it back into
// playerId -> teammates and playerId -> seasons.
async function loadData() {
  const [, chain] = await Promise.all([loadCommon(), fetchJson("chain")]);
  const { ids } = chain;
  ids.forEach((id, i) => {
    let n = 0;
    data.graph[id] = chain.graph[i].map((gap) => ids[(n += gap)]);
    data.seasons[id] = chain.seasons[i].map(([season, teams, games, ppg, rpg, apg]) => ({
      season,
      teams: teams.split("/"),
      stats: { games, ppg, rpg, apg },
    }));
  });
  const graph = data.graph;

  const options = [];
  for (const id of Object.keys(graph)) {
    const label = `${name(id)} (${careerSpan(id)})`;
    data.labelToId[label] = id;
    data.idToLabel[id] = label;
    options.push(label);
  }
  for (const [level, { minPpg }] of Object.entries(LEVELS)) {
    data.pools[level] = Object.keys(graph).filter((id) =>
      (data.seasons[id] || []).some((s) => s.stats.ppg >= minPpg && s.stats.games >= MIN_GAMES)
    );
  }
  options.sort();
  $("players").innerHTML = options.map((l) => `<option value="${escapeHtml(l)}">`).join("");
}

function careerSpan(id) {
  const list = data.seasons[id] || [];
  return list.length ? `${list[0].season} – ${list[list.length - 1].season}` : "";
}

// Accept the full label or a bare name, as long as the name is unique.
function resolvePlayer(text) {
  text = text.trim();
  if (data.labelToId[text]) return { id: data.labelToId[text] };
  const matches = Object.keys(data.graph).filter(
    (id) => data.players[id].name.toLowerCase() === text.toLowerCase()
  );
  if (matches.length === 1) return { id: matches[0] };
  if (matches.length > 1) return { error: "More than one player has that name. Pick the one with the right years from the list." };
  return { error: "Couldn't find that player. Pick a name from the list." };
}

function areTeammates(a, b) {
  return (data.graph[a] || []).includes(b);
}

// Breadth-first search from start. Returns { dist, prev } for every reachable player.
function bfs(start) {
  const dist = { [start]: 0 };
  const prev = { [start]: null };
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const next of data.graph[current] || []) {
      if (next in dist) continue;
      dist[next] = dist[current] + 1;
      prev[next] = current;
      queue.push(next);
    }
  }
  return { dist, prev };
}

function pathFrom(prev, goal) {
  const path = [goal];
  while (prev[path[path.length - 1]] !== null) path.push(prev[path[path.length - 1]]);
  return path.reverse();
}

// Every "season team" two players shared, e.g. ["2009-10 LAL"].
function sharedTeamSeasons(a, b) {
  const keys = (id) =>
    new Set((data.seasons[id] || []).flatMap((s) => s.teams.map((t) => `${s.season} ${t}`)));
  const bKeys = keys(b);
  return [...keys(a)].filter((k) => bKeys.has(k)).sort();
}

// ---------- game ----------

// Pick a random start from the level's pool, then a random target from the
// pool exactly the level's distance away. Retries with a new start if none fit.
function pickMatchup(level) {
  const { between, minLinks = 0 } = LEVELS[level];
  const pool = data.pools[level];
  const random = (list) => list[Math.floor(Math.random() * list.length)];
  for (let tries = 0; tries < 300; tries++) {
    const a = random(pool);
    const { dist, prev } = bfs(a);
    const targets = pool.filter(
      (b) => dist[b] === between + 1 && (!minLinks || commonTeammates(a, b) >= minLinks)
    );
    if (targets.length) {
      const b = random(targets);
      return { start: a, target: b, best: pathFrom(prev, b) };
    }
  }
  throw new Error("Couldn't find a matchup for this level.");
}

// Players who were teammates of both a and b (the one-link-between options).
function commonTeammates(a, b) {
  const bs = new Set(data.graph[b]);
  return data.graph[a].filter((n) => bs.has(n)).length;
}

function newGame() {
  Object.assign(game, pickMatchup(game.level), { log: [], guesses: 0, hint: null, hintsUsed: 0, over: false, drawnLength: 1 });
  game.chain = [game.start];
  game.distToTarget = bfs(game.target).dist;

  $("guess").value = "";
  for (const id of ["guess", "guess-btn", "give-up", "hint-btn"]) $(id).disabled = false;
  $("result").hidden = true;
  $("guess-form").hidden = false;
  setMessage("");
  render();
  $("guess").focus();
}

function setLevel(level) {
  game.level = level;
  try { localStorage.setItem("tc-level", level); } catch {}
  newGame();
}

function loadLevel() {
  try {
    const saved = localStorage.getItem("tc-level");
    if (saved in LEVELS) return saved;
  } catch {}
  return "easy";
}

function submitGuess() {
  if (game.over) return;
  const text = $("guess").value;
  if (!text.trim()) return;

  const { id, error } = resolvePlayer(text);
  if (error) return setMessage(error, "bad");   // typos don't cost a guess

  const end = game.chain[game.chain.length - 1];
  if (game.chain.includes(id)) return setMessage(`${name(id)} is already in your chain.`, "bad");

  game.guesses++;
  $("guess").value = "";

  if (!areTeammates(end, id)) {
    game.log.push({ id, hit: false });
    setMessage(`✕ ${name(id)} and ${name(end)} were never teammates.`, "bad");
    return render();
  }

  game.log.push({ id, hit: true });
  game.chain.push(id);

  if (id === game.target) return finish(true);
  if (areTeammates(id, game.target)) {
    // The new player links straight to the target, so the chain is complete.
    game.chain.push(game.target);
    return finish(true);
  }

  const where = sharedTeamSeasons(end, id)[0];
  setMessage(`✓ ${name(id)} played with ${name(end)} on the ${where}. Keep going.`, "good");
  render();
}

// A hint describes, without naming him, the next player on a shortest path
// from the end of the chain: the years he spent on the team he shared with
// the chain's end, and his stats from his best season with that team.
function showHint() {
  if (game.over) return;
  const end = game.chain[game.chain.length - 1];
  if (game.hint?.forEnd === end) return;
  game.hint = makeHint(end);
  game.hintsUsed++;
  render();
}

function makeHint(end) {
  const d = game.distToTarget[end];
  const candidates = (data.graph[end] || []).filter(
    (n) => game.distToTarget[n] === d - 1 && !game.chain.includes(n)
  );
  // The best-known player is the most useful hint.
  const next = candidates.reduce((a, b) => (peakPpg(b) > peakPpg(a) ? b : a));

  // Of the teams they shared, use the one this player spent the most seasons on.
  const sharedTeams = [...new Set(sharedTeamSeasons(end, next).map((k) => k.split(" ")[1]))];
  const seasonsOn = (team) => data.seasons[next].filter((s) => s.teams.includes(team));
  const team = sharedTeams.reduce((a, b) => (seasonsOn(b).length > seasonsOn(a).length ? b : a));
  const onTeam = seasonsOn(team);

  // Traded seasons only have combined stats, so prefer full seasons with this team.
  const full = onTeam.filter((s) => s.teams.length === 1);
  const pool = full.length ? full : onTeam;
  const best = pool.reduce((a, b) => ((b.stats.ppg ?? -1) > (a.stats.ppg ?? -1) ? b : a));

  return {
    forEnd: end,
    team,
    years: stints(onTeam.map((s) => s.season)),
    season: best.season,
    combined: best.teams.length > 1,
    stats: best.stats,
  };
}

// ["2011-12", "2012-13", "2022-23"] -> "2011-12 – 2012-13, 2022-23"
function stints(seasons) {
  const year = (season) => Number(season.slice(0, 4));
  const runs = [];
  for (const season of seasons) {
    const run = runs[runs.length - 1];
    if (run && year(season) === year(run[1]) + 1) run[1] = season;
    else runs.push([season, season]);
  }
  return runs.map(([a, b]) => (a === b ? a : `${a} – ${b}`)).join(", ");
}

function peakPpg(id) {
  return Math.max(-1, ...(data.seasons[id] || []).map((s) => s.stats.ppg ?? -1));
}

function undo() {
  if (game.over || game.chain.length <= 1) return;
  const removed = game.chain.pop();
  setMessage(`Removed ${name(removed)}. Undo doesn't give the guess back.`);
  render();
}

function finish(solved) {
  game.over = true;
  game.solved = solved;
  for (const id of ["guess", "guess-btn", "undo", "give-up", "hint-btn"]) $(id).disabled = true;
  setMessage("");
  render();

  const par = game.best.length - 2;
  const extra = game.guesses - par;
  const plural = (n) => `${n} guess${n === 1 ? "" : "es"}`;

  $("result").classList.toggle("lose", !solved);
  if (solved && extra <= 0) celebrate();
  if (solved) {
    $("result-kicker").textContent = extra <= 0 ? "Perfect chain" : "Chain complete";
    $("result-title").textContent = plural(game.guesses);
    $("result-text").textContent =
      extra <= 0
        ? `You matched the best possible (${par}).`
        : `The best possible was ${par}. You were ${extra} over.`;
  } else {
    $("result-kicker").textContent = "Gave up";
    $("result-title").textContent = `${par} needed`;
    $("result-text").textContent = `You used ${plural(game.guesses)}. Here's one way to do it.`;
  }
  if (game.hintsUsed) {
    $("result-text").textContent += ` ${game.hintsUsed} hint${game.hintsUsed === 1 ? "" : "s"} used.`;
  }
  // Only show the answer if they gave up or found a longer chain than the best.
  const optimal = solved && game.chain.length === game.best.length;
  $("solution").innerHTML = chainHtml(game.best);
  $("solution-wrap").hidden = optimal;
  $("guess-form").hidden = true;
  $("result").hidden = false;
  $("play-again").focus();
}

// ---------- rendering ----------

function render() {
  const { hints } = LEVELS[game.level];

  for (const btn of document.querySelectorAll(".difficulty button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.level === game.level));
  }

  const state = $("state");
  state.className = "state";
  if (!game.over) {
    state.textContent = `${game.level} · in play`;
  } else if (game.solved) {
    state.textContent = "Chain complete";
    state.classList.add("win");
  } else {
    state.textContent = "Gave up";
    state.classList.add("lose");
  }

  $("start-name").textContent = name(game.start);
  $("target-name").textContent = name(game.target);
  $("start-photo").innerHTML = avatar(game.start, "xl");
  $("target-photo").innerHTML = avatar(game.target, "xl");
  $("start-meta").textContent = hints ? hintText(game.start) : "No hints on Hard.";
  $("target-meta").textContent = hints ? hintText(game.target) : "No hints on Hard.";

  $("guesses").textContent = game.guesses;
  $("par").textContent = game.best.length - 2;

  // A link that's new since the last draw animates in.
  const grew = game.chain.length > (game.drawnLength || 1);
  game.drawnLength = game.chain.length;
  $("chain").innerHTML = chainHtml(game.chain, { freshLast: grew });

  const end = game.chain[game.chain.length - 1];
  $("guess-label").textContent = `Name a teammate of ${name(end)}`;
  $("undo").disabled = game.over || game.chain.length <= 1;

  // A hint belongs to one chain end; guessing on or undoing clears it.
  const hint = game.hint?.forEnd === end && !game.over ? game.hint : null;
  $("hint").hidden = !hint;
  $("hint-btn").disabled = game.over || Boolean(hint);
  if (hint) {
    const st = hint.stats;
    const num = (v, d = 1) => (v == null ? "–" : v.toFixed(d));
    $("hint").innerHTML = `
      <span class="label">Hint · a teammate of ${escapeHtml(name(end))}</span>
      <p class="hint-line">Played for <strong>${hint.team}</strong> in <strong>${hint.years}</strong></p>
      <p class="hint-sub">Best season with ${hint.team}: ${hint.season}${hint.combined ? " (season totals, traded mid-year)" : ""}</p>
      <div class="stats">
        <span><b>${num(st.ppg)}</b> PPG</span>
        <span><b>${num(st.rpg)}</b> RPG</span>
        <span><b>${num(st.apg)}</b> APG</span>
        <span><b>${num(st.games, 0)}</b> GP</span>
      </div>`;
  }

  $("log").innerHTML = game.log.length
    ? game.log
        .map(
          ({ id, hit }, i) => `
      <li class="${hit ? "hit" : "miss"}">
        <span class="top"><span>#${i + 1}</span><span>${hit ? "✓" : "✕"}</span></span>
        ${avatar(id, "sm")}
        <span class="who">${game.over ? playerLink(id) : escapeHtml(name(id))}</span>
      </li>`
        )
        .join("")
    : `<li class="empty">No guesses yet</li>`;
}

function hintText(id) {
  return `${careerSpan(id)} · Best: ${bestSeason(id)}`;
}

// Draws a chain of player tiles with the linking team-season between them.
// While playing, the target is drawn at the bottom, still unlinked.
function chainHtml(path, { freshLast = false } = {}) {
  const complete = path[path.length - 1] === game.target;
  const parts = [];

  path.forEach((id, i) => {
    if (i > 0) {
      const shared = sharedTeamSeasons(path[i - 1], id);
      const more = shared.length > 1 ? ` <span>+${shared.length - 1} more</span>` : "";
      const fresh = freshLast && i === path.length - 1 ? " fresh" : "";
      parts.push(`<li class="link${fresh}">Teammates · <strong>${shared[0]}</strong>${more}</li>`);
    }
    const season = i > 0 ? sharedTeamSeasons(path[i - 1], id)[0].split(" ")[0] : null;
    const isEnd = id === game.start || id === game.target;
    const label = id === game.start ? "Start" : id === game.target ? "Target" : `Link ${i}`;
    parts.push(tile(id, { label, season, isEnd, done: complete }));
  });

  if (!complete) {
    parts.push(`<li class="gap">? ? ?</li>`);
    parts.push(tile(game.target, { label: "Target", season: null, isEnd: true, done: false }));
  }
  return parts.join("");
}

function tile(id, { label, season, isEnd, done }) {
  const cls = ["tile", isEnd ? "end" : "", isEnd && done ? "done" : ""].join(" ");
  // The start and target already have their hints in the headline above.
  const sub = season ? `<div class="sub">${season}</div>${statLine(id, season)}` : "";
  return `
    <li class="${cls}">
      ${avatar(id, "md")}
      <div class="tile-body">
        <div class="num">${label}</div>
        <h3>${game.over ? playerLink(id) : escapeHtml(name(id))}</h3>
        ${sub}
      </div>
    </li>`;
}

// e.g. "27.5 PPG (2017-18 CLE)"
function bestSeason(id) {
  const list = (data.seasons[id] || []).filter((s) => s.stats.ppg != null);
  if (!list.length) return "–";
  const top = list.reduce((a, b) => (b.stats.ppg > a.stats.ppg ? b : a));
  return `${top.stats.ppg.toFixed(1)} PPG (${top.season} ${top.teams.join("/")})`;
}

function statLine(id, season) {
  const s = (data.seasons[id] || []).find((x) => x.season === season);
  if (!s) return "";
  const st = s.stats;
  const num = (v, d = 1) => (v == null ? "–" : v.toFixed(d));
  return `
    <div class="stats">
      <span><b>${num(st.ppg)}</b> PPG</span>
      <span><b>${num(st.rpg)}</b> RPG</span>
      <span><b>${num(st.apg)}</b> APG</span>
      <span><b>${num(st.games, 0)}</b> GP</span>
    </div>`;
}

function setMessage(text, kind = "") {
  $("message").textContent = text;
  $("message").className = `message ${kind}`;
}

// ---------- wiring ----------

$("guess-form").addEventListener("submit", (e) => {
  e.preventDefault();
  submitGuess();
});
$("undo").addEventListener("click", undo);
$("hint-btn").addEventListener("click", showHint);
$("give-up").addEventListener("click", () => finish(false));
$("new-game").addEventListener("click", newGame);
$("play-again").addEventListener("click", newGame);
for (const btn of document.querySelectorAll(".difficulty button")) {
  btn.addEventListener("click", () => setLevel(btn.dataset.level));
}

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
