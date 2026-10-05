// Name the Team (a Hindsight tab) - a random All-NBA, All-Defensive, or
// All-Rookie team from 1979-80 on. Name its players; three misses and you're
// done, and every miss reveals one missing player's team as a clue. The pass
// mark is lower for the harder team types.
// Full Roster is different: a whole team-season from 1984-85 on, and you name
// as many of its players as you can in 60 seconds. Misses don't count.

const MISSES = 3;
const SAVE_KEY = eraKey("nt-v1");   // { type: "All-NBA", streak, best, [type]: { played, passed } }

// How many of a five-man team you need to pass (scaled for 6- and 7-man teams).
const PASS_MARK = { "All-NBA": 4, "All-Defense": 3, "All-Rookie": 2 };
const ROSTER = "Full Roster";
const ROSTER_SECONDS = 60;
const ROSTER_PASS = 5;
const NUMBER_WORD = { "1st": "First", "2nd": "Second", "3rd": "Third" };

Object.assign(data, {
  teams: [],        // every team from season_teams.json
  rosterSeasons: [], // "1984-85" ... from rosters/index.json
  rosters: {},      // season -> that season's rosters, fetched when needed
  index: {},        // player id -> [name, from, to], for guessing
  labelToId: {},
});

const game = {
  type: loadSaved().type || "All-NBA",
  team: null,
  found: new Set(),     // ids named so far
  misses: [],           // wrong ids
  clues: [],            // ids whose team has been revealed as a clue
  over: false,
  endsAt: null,         // Full Roster: when the clock runs out
  clock: null,
};

// ---------- data ----------

async function loadData() {
  const [, teams, index, seasons] = await Promise.all([loadCommon(), fetchJson("season_teams"), fetchJson("player/index"), fetchJson("rosters/index")]);
  const endYear = (s) => Number(String(s).slice(0, 4)) + 1;
  data.teams = teams.filter((t) => !MODERN || endYear(t.season) >= MODERN_SEASON);
  data.rosterSeasons = seasons.filter((s) => !MODERN || endYear(s) >= MODERN_SEASON);
  data.index = index;
  for (const t of teams) for (const p of t.players) data.players[p.id] ||= { name: p.name };
  // Anyone can be guessed. Names shared by two players get their years.
  const counts = {};
  for (const [n] of Object.values(index)) counts[n] = (counts[n] || 0) + 1;
  const options = [];
  for (const [id, [n, from, to]] of Object.entries(index)) {
    if (!from) continue;
    const label = counts[n] > 1 ? `${n} (${from} – ${to})` : n;
    data.labelToId[label] = id;
    options.push(label);
  }
  $("all-players").innerHTML = options.sort().map((l) => `<option value="${escapeHtml(l)}">`).join("");
}

// ---------- saved results ----------

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}

function writeSaved(saved) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch {}
}

// ---------- game ----------

const isRoster = () => game.type === ROSTER;
const teamName = (t) => (t.type === ROSTER ? `${t.season} ${t.name}` : `${t.season} ${t.type} ${NUMBER_WORD[t.number]} Team`);
const passMark = (t) => (t.type === ROSTER ? Math.min(ROSTER_PASS, t.players.length) : PASS_MARK[t.type] + (t.players.length - 5));

// A random team-season's full roster, in the same shape as the award teams.
async function randomRoster() {
  const season = data.rosterSeasons[Math.floor(Math.random() * data.rosterSeasons.length)];
  const file = String(Number(season.slice(0, 4)) + 1);
  data.rosters[season] ||= await fetchJson(`rosters/${file}`);
  const choices = data.rosters[season].filter((t) => !(game.team && game.team.season === season && game.team.team === t.team));
  const t = choices[Math.floor(Math.random() * choices.length)];
  for (const [id] of t.players) data.players[id] ||= { name: data.index[id][0] };
  return {
    season, type: ROSTER, team: t.team, name: t.name, record: t.record,
    players: t.players.map(([id, pos, ppg, rpg, apg]) => ({ id, name: data.index[id][0], pos: pos.split("-")[0], team: t.team, ppg, rpg, apg })),
  };
}

async function newTeam() {
  stopClock();
  let team;
  if (isRoster()) team = await randomRoster();
  else {
    const choices = data.teams.filter((t) => t.type === game.type && t !== game.team);
    team = choices[Math.floor(Math.random() * choices.length)];
  }
  Object.assign(game, { team, found: new Set(), misses: [], clues: [], over: false, endsAt: null });
  $("guess").value = "";
  $("result").hidden = true;
  $("guess-form").hidden = false;
  say("");
  render();
  $("guess").focus({ preventScroll: true });
}

function setType(type) {
  game.type = type;
  const saved = loadSaved();
  saved.type = type;
  writeSaved(saved);
  newTeam();
}

// ---------- Full Roster clock ----------

function startClock() {
  if (!isRoster() || game.over || game.endsAt) return;
  game.endsAt = Date.now() + ROSTER_SECONDS * 1000;
  game.clock = setInterval(tick, 250);
  render();
}

function stopClock() {
  if (game.clock) clearInterval(game.clock);
  game.clock = null;
}

const secondsLeft = () => (game.endsAt ? Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000)) : ROSTER_SECONDS);

function tick() {
  if (game.over) return stopClock();
  if (secondsLeft() <= 0) return finish();
  $("strikes").textContent = secondsLeft();
  $("strikes").classList.toggle("nt-hurry", secondsLeft() <= 10);
}

function submitGuess() {
  if (game.over) return;
  startClock();
  const text = $("guess").value.trim();
  if (!text) return;
  const id = data.labelToId[text] ?? Object.entries(data.labelToId).find(([l]) => l.toLowerCase() === text.toLowerCase())?.[1];
  if (!id) return say("Pick a name from the list. Names shared by two players include their years.", "bad");
  if (game.found.has(id) || game.misses.includes(id)) return say("You already guessed him.", "bad");
  if (isRoster() && secondsLeft() <= 0) return finish();
  $("guess").value = "";

  if (game.team.players.some((p) => p.id === id)) {
    game.found.add(id);
    say(`✓ ${data.index[id][0]} made it.`, "good");
    if (game.found.size === game.team.players.length) return finish();
  } else if (isRoster()) {
    game.misses.push(id);
    say(`✕ ${data.index[id][0]} didn't play for them that season.`, "bad");
  } else {
    game.misses.push(id);
    // A clue: one missing player's team.
    const missing = game.team.players.filter((p) => !game.found.has(p.id) && !game.clues.includes(p.id));
    if (missing.length) game.clues.push(missing[Math.floor(Math.random() * missing.length)].id);
    say(`✕ ${data.index[id][0]} wasn't on it.${game.misses.length < MISSES ? " A team is now showing as a clue." : ""}`, "bad");
    if (game.misses.length >= MISSES) return finish();
  }
  render();
}

function finish() {
  if (game.over) return;
  stopClock();
  game.over = true;
  const t = game.team;
  const passed = game.found.size >= passMark(t);
  const saved = loadSaved();
  saved.streak = passed ? (saved.streak || 0) + 1 : 0;
  saved.best = Math.max(saved.best || 0, saved.streak);
  const stats = (saved[t.type] ||= { played: 0, passed: 0 });
  stats.played++;
  if (passed) stats.passed++;
  writeSaved(saved);
  game.passed = passed;
  if (game.found.size === t.players.length) celebrate();
  say("");
  render();
}

function say(text, kind = "") {
  $("message").textContent = text;
  $("message").className = `message ${kind}`;
}

const emoji = () => game.team.players.map((p) => (game.found.has(p.id) ? "🟩" : "⬜")).join("");

async function share() {
  const t = game.team;
  const text = `Name the Team 🏅 ${teamName(t)}\n${emoji()} ${game.found.size}/${t.players.length}${game.passed ? " ✓" : ""}`;
  await shareResult(text, $("share-msg"));
}

function saveImage() {
  const t = game.team;
  shareImage({
    title: "Name the Team",
    kicker: teamName(t),
    big: `${game.found.size}/${t.players.length}`,
    grid: [emoji()],
    lines: [game.passed ? "Passed" : `Needed ${passMark(t)}`],
  }, $("share-msg"));
}

// ---------- rendering ----------

function render() {
  const t = game.team;
  const saved = loadSaved();
  for (const btn of document.querySelectorAll(".nt-types button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.type === game.type));
  }
  $("streak").textContent = saved.streak || 0;
  $("strikes-label").textContent = isRoster() ? "Seconds left" : "Misses left";
  $("strikes").textContent = isRoster() ? secondsLeft() : MISSES - game.misses.length;
  $("strikes").classList.toggle("nt-hurry", isRoster() && game.endsAt != null && secondsLeft() <= 10);
  $("kicker").textContent = isRoster() ? `Name the roster · ${t.record}` : `Name the ${t.type} team`;
  $("title").textContent = teamName(t);
  $("goal").textContent = isRoster()
    ? `${t.players.length} players suited up for them. Name as many as you can in ${ROSTER_SECONDS} seconds; ${passMark(t)} to pass. The clock starts when you start typing.`
    : `${t.players.length} players. Name ${passMark(t)} to pass. Three misses and you're done, and each miss shows one missing player's team.`;

  const state = $("state");
  state.className = "state";
  state.textContent = game.over ? (game.passed ? "Passed" : "Missed it") : `${game.found.size} of ${t.players.length}`;
  $("slots").classList.toggle("nt-roster", isRoster());
  if (game.over) state.classList.add(game.passed ? "win" : "lose");

  $("slots").innerHTML = t.players
    .map((p, i) => {
      const got = game.found.has(p.id);
      const show = got || game.over;
      const clue = !show && game.clues.includes(p.id);
      const line = p.ppg != null ? `${p.ppg} PPG · ${p.rpg} RPG · ${p.apg} APG` : "";
      return `
        <li class="nt-slot ${got ? "got" : game.over ? "missed" : ""}" style="animation-delay: ${i * 0.05}s">
          <span class="sd-pos">${p.pos || "–"}</span>
          ${show ? avatar(p.id, "xs") : `<span class="nt-blank" aria-hidden="true"></span>`}
          <span class="nt-body">
            <span class="nt-name">${show ? (game.over ? playerLink(p.id, p.name) : escapeHtml(p.name)) : "?"}</span>
            <span class="nt-sub">${show ? `${p.team} · ${line}` : clue ? `Played for <b class="cp-badge nt-clue" style="--team: ${teamColor(p.team)}">${p.team}</b>` : "Unknown"}</span>
          </span>
          ${got ? `<span class="nt-check">✓</span>` : ""}
        </li>`;
    })
    .join("");

  $("misses").innerHTML = game.misses.map((id) => `<li>✕ ${escapeHtml(data.index[id][0])}</li>`).join("");
  $("guess-form").hidden = game.over;
  $("result").hidden = !game.over;
  if (game.over) {
    $("result").classList.toggle("lose", !game.passed);
    $("result-kicker").textContent = game.found.size === t.players.length ? "Perfect" : game.passed ? "Passed" : "Not quite";
    $("result-title").textContent = `${game.found.size} of ${t.players.length}`;
    $("result-emoji").textContent = emoji();
    const s = saved[t.type] || { played: 0, passed: 0 };
    $("result-text").textContent = `${game.passed ? "Passed" : `Needed ${passMark(t)} to pass`}. ${t.type}: ${s.passed} of ${s.played} passed. Best pass streak: ${saved.best || 0}.`;
    $("share-msg").textContent = "";
  }
}

// ---------- wiring ----------

$("guess-form").addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
$("guess").addEventListener("input", startClock);
$("give-up").addEventListener("click", finish);
$("random-team").addEventListener("click", newTeam);
$("next").addEventListener("click", () => { newTeam(); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);
for (const btn of document.querySelectorAll(".nt-types button")) {
  btn.addEventListener("click", () => setType(btn.dataset.type));
}

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    newTeam();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
