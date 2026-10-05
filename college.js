// College Connect - two modes:
//   College × Team: a college and an NBA franchise. Name anyone who played
//     for both (from 1979-80 on). Afterward you see everyone who fit.
//   Name the College: a player. Name his college. Misses unlock clues (its
//     first letter, then how many NBA players it has sent since 1980).
// Three guesses a round either way; run out and the streak is over.

const SAVE_KEY = eraKey("cc-v1");   // { mode, level, easy|hard: { streak, best }, "school-easy"|"school-hard": { ... } }
const GUESSES = 3;
const KNOWN_WS = 15;   // a "known" answer has 15+ career Win Shares
const LEVELS = {
  easy: { minCollege: MODERN ? 12 : 30, minKnown: MODERN ? 2 : 3 },   // big programs, several well-known answers
  hard: { minCollege: 0, minKnown: 1 },    // any school, at least one well-known answer
};
// Name the College: how well-known the player has to be (career Win Shares).
const SCHOOL_MIN_WS = { easy: MODERN ? 30 : 50, hard: 3 };

Object.assign(data, {
  colleges: [], teams: [],
  byId: {},          // id -> { name, fame, colleges: Set, teams: Set }
  collegeSize: [],   // players per college
  labelToId: {},
});

const game = {
  mode: loadSaved().mode === "school" ? "school" : "pair",
  level: loadSaved().level === "hard" ? "hard" : "easy",
  college: null, team: null, answers: [], misses: [], got: null, over: false,
  seen: new Set(),   // "college:team" pairs (or player ids) used this run
  player: null,      // Name the College: the mystery player's id
};

// ---------- data ----------

async function loadData() {
  const [, file] = await Promise.all([loadCommon(), fetchJson("college_connect")]);
  data.colleges = file.colleges;
  data.teams = file.teams;
  data.collegeSize = file.colleges.map(() => 0);
  const counts = {};
  for (const [, n] of file.players) counts[n] = (counts[n] || 0) + 1;
  for (const [id, n, fame, colleges, teams] of file.players) {
    if (!inEra(id)) continue;
    data.byId[id] = { name: n, fame, colleges: new Set(colleges), teams: new Set(teams) };
    data.players[id] ||= { name: n };
    for (const c of colleges) data.collegeSize[c]++;
    data.labelToId[counts[n] > 1 ? `${n} (${data.colleges[colleges[0]]})` : n] = id;
  }
  $("cc-players").innerHTML = Object.keys(data.labelToId).sort().map((l) => `<option value="${escapeHtml(l)}">`).join("");
  $("cc-colleges").innerHTML = data.colleges.map((c, i) => [c, i]).filter(([, i]) => data.collegeSize[i])
    .sort((a, b) => a[0].localeCompare(b[0])).map(([c]) => `<option value="${escapeHtml(c)}">`).join("");
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}

function writeSaved(saved) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch {}
}

const recordKey = () => (game.mode === "school" ? `school-${game.level}` : game.level);
const record = () => loadSaved()[recordKey()] || { streak: 0, best: 0 };

// ---------- game ----------

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const fits = (id, college, team) => data.byId[id].colleges.has(college) && data.byId[id].teams.has(team);
const answersFor = (college, team) =>
  Object.keys(data.byId).filter((id) => fits(id, college, team)).sort((a, b) => data.byId[b].fame - data.byId[a].fame);

function newPair() {
  const { minCollege, minKnown } = LEVELS[game.level];
  const colleges = data.colleges.map((c, i) => i).filter((i) => data.collegeSize[i] >= minCollege);
  for (let attempt = 0; attempt < 2000; attempt++) {
    const college = pick(colleges), team = Math.floor(Math.random() * data.teams.length);
    if (game.seen.has(`${college}:${team}`)) continue;
    const answers = answersFor(college, team);
    if (answers.filter((id) => data.byId[id].fame >= KNOWN_WS).length < minKnown) continue;
    game.seen.add(`${college}:${team}`);
    Object.assign(game, { college, team, answers, misses: [], got: null, over: false });
    $("guess").value = "";
    say("");
    render();
    $("guess").focus({ preventScroll: true });
    return;
  }
  game.seen.clear();
  newPair();
}

function newRound() {
  if (game.mode === "school") newPlayer();
  else newPair();
}

function setLevel(level) {
  game.level = level;
  game.seen.clear();
  const saved = loadSaved();
  saved.level = level;
  writeSaved(saved);
  newRound();
}

function setMode(mode) {
  game.mode = mode;
  game.seen.clear();
  const saved = loadSaved();
  saved.mode = mode;
  writeSaved(saved);
  newRound();
}

// ---------- Name the College ----------

function newPlayer() {
  const minWs = SCHOOL_MIN_WS[game.level];
  let pool = Object.keys(data.byId).filter((id) => data.byId[id].fame >= minWs && !game.seen.has(id));
  if (!pool.length) { game.seen.clear(); pool = Object.keys(data.byId).filter((id) => data.byId[id].fame >= minWs); }
  const player = pick(pool);
  game.seen.add(player);
  Object.assign(game, { player, misses: [], got: null, over: false });
  $("school").value = "";
  sayIn("school-message", "");
  render();
  $("school").focus({ preventScroll: true });
}

// A player's schools, the biggest program first (that's the one the clues describe).
const schoolsOf = (id) => [...data.byId[id].colleges].sort((a, b) => data.collegeSize[b] - data.collegeSize[a]);

function submitSchool() {
  if (game.over) return;
  const text = $("school").value.trim();
  if (!text) return;
  const college = data.colleges.findIndex((c) => c.toLowerCase() === text.toLowerCase());
  if (college < 0) return sayIn("school-message", "Pick a college from the list.", "bad");
  if (game.misses.includes(college)) return sayIn("school-message", "You already guessed that one.", "bad");
  $("school").value = "";
  if (data.byId[game.player].colleges.has(college)) return finish(college);
  game.misses.push(college);
  if (game.misses.length >= GUESSES) return finish(null);
  sayIn("school-message", `✕ Not ${data.colleges[college]}. A clue just unlocked.`, "bad");
  render();
}

function schoolClues() {
  const main = schoolsOf(game.player)[0];
  const n = data.collegeSize[main];
  return [
    `Starts with <b>${escapeHtml(data.colleges[main][0])}</b>`,
    `Has sent <b>${n}</b> player${n === 1 ? "" : "s"} to the NBA since 1980${MODERN ? " (from the 2003 class on)" : ""}`,
  ];
}

const collegeName = () => data.colleges[game.college];
const teamAbbr = () => data.teams[game.team];
const teamNick = () => TEAM_NICKS[teamAbbr()] || teamAbbr();

function submitGuess() {
  if (game.over) return;
  const text = $("guess").value.trim();
  if (!text) return;
  const id = data.labelToId[text] ?? Object.entries(data.labelToId).find(([l]) => l.toLowerCase() === text.toLowerCase())?.[1];
  if (!id) return say("Pick a name from the list. It only has players who went to college and played from 1980 on.", "bad");
  if (game.misses.includes(id)) return say("You already guessed him.", "bad");
  $("guess").value = "";
  if (fits(id, game.college, game.team)) return finish(id);
  game.misses.push(id);
  const p = data.byId[id];
  const why = !p.colleges.has(game.college) && !p.teams.has(game.team) ? `played for neither`
    : !p.colleges.has(game.college) ? `didn't go to ${collegeName()}` : `never played for the ${teamNick()}`;
  if (game.misses.length >= GUESSES) return finish(null);
  say(`✕ ${p.name} ${why}.`, "bad");
  render();
}

function finish(id) {
  game.over = true;
  game.got = id;
  const saved = loadSaved();
  const r = (saved[recordKey()] ||= { streak: 0, best: 0 });
  r.streak = id != null ? r.streak + 1 : 0;
  r.best = Math.max(r.best, r.streak);
  writeSaved(saved);
  if (id == null) game.seen.clear();
  if (id != null) celebrate();
  say("");
  sayIn("school-message", "");
  render();
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function say(text, kind = "") {
  sayIn("message", text, kind);
}

function sayIn(el, text, kind = "") {
  $(el).textContent = text;
  $(el).className = `message ${kind}`;
}

// ---------- sharing ----------

const levelName = () => (game.level === "hard" ? "Hard" : "Easy");

async function share() {
  const r = record();
  if (game.mode === "school") {
    const p = data.byId[game.player];
    const tries = game.got != null ? "🟥".repeat(game.misses.length) + "🟩" : "🟥".repeat(GUESSES);
    return shareResult(`College Connect: Name the College (${levelName()}) 🎓 ${p.name}\n${tries} · streak ${r.streak}`, $("share-msg"));
  }
  const text = game.got
    ? `College Connect (${levelName()}) 🎓 ${collegeName()} × ${teamNick()}: ${data.byId[game.got].name}\nStreak ${r.streak} · best ${r.best}`
    : `College Connect (${levelName()}) 🎓 Run over at ${r.best ? `best ${r.best}` : "0"}. Stumped by ${collegeName()} × ${teamNick()}`;
  await shareResult(text, $("share-msg"));
}

function saveImage() {
  const r = record();
  shareImage({
    title: "College Connect",
    kicker: game.mode === "school" ? `Name the College · ${levelName()}` : `${levelName()} · ${collegeName()} × ${teamNick()}`,
    big: String(r.streak),
    lines: game.mode === "school"
      ? [`${data.byId[game.player].name}: ${schoolsOf(game.player).map((c) => data.colleges[c]).join(" / ")}`, `Best streak ${r.best}`]
      : [game.got ? `Got it with ${data.byId[game.got].name}` : "Stumped", `Best streak ${r.best}`],
  }, $("share-msg"));
}

// ---------- rendering ----------

// Team nicknames for the badges (same franchises as the Awards Grid).
const TEAM_NICKS = {
  ATL: "Hawks", BOS: "Celtics", BRK: "Nets", CHI: "Bulls", CHO: "Hornets", CLE: "Cavaliers", DAL: "Mavericks", DEN: "Nuggets",
  DET: "Pistons", GSW: "Warriors", HOU: "Rockets", IND: "Pacers", LAC: "Clippers", LAL: "Lakers", MEM: "Grizzlies", MIA: "Heat",
  MIL: "Bucks", MIN: "Timberwolves", NOP: "Pelicans", NYK: "Knicks", OKC: "Thunder", ORL: "Magic", PHI: "76ers", PHO: "Suns",
  POR: "Trail Blazers", SAC: "Kings", SAS: "Spurs", TOR: "Raptors", UTA: "Jazz", WAS: "Wizards",
};

// Franchises that moved or changed names count their old teams too.
const OLD_NAMES = {
  OKC: "Seattle SuperSonics", BRK: "New Jersey Nets", MEM: "Vancouver Grizzlies", NOP: "New Orleans Hornets",
  CHO: "Charlotte Bobcats and old Hornets", WAS: "Washington Bullets", SAC: "Kansas City Kings", LAC: "San Diego Clippers",
};

function render() {
  for (const btn of document.querySelectorAll(".cc-levels button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.level === game.level));
  }
  for (const btn of document.querySelectorAll(".cc-modes button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.mode === game.mode));
  }
  const school = game.mode === "school";
  $("easy-label").textContent = school ? "stars" : "big programs";
  $("hard-label").textContent = school ? "anyone" : "any school";
  $("prompt").textContent = school ? "Where did he play college ball?" : "Name a player who played for both";
  $("guess-form").hidden = school || game.over;
  $("school-form").hidden = !school || game.over;
  if (school) return renderSchool();
  const r = record();
  $("streak").textContent = r.streak;
  $("best").textContent = r.best;
  $("left").textContent = GUESSES - game.misses.length;
  const state = $("state");
  state.className = "state";
  state.textContent = game.over ? (game.got ? "Got it" : "Stumped") : `${GUESSES - game.misses.length} left`;
  if (game.over) state.classList.add(game.got ? "win" : "lose");

  $("pair").innerHTML = `
    <div class="cc-side cc-college"><span class="label">College</span><b>${escapeHtml(collegeName())}</b></div>
    <span class="cc-x" aria-hidden="true">×</span>
    <div class="cc-side cc-team" style="--team: ${teamColor(teamAbbr())}"><span class="label">Team</span><b>${escapeHtml(teamNick())}</b><small>${OLD_NAMES[teamAbbr()] ? `Includes the ${OLD_NAMES[teamAbbr()]}` : teamAbbr()}</small></div>`;

  $("misses").innerHTML = game.misses.map((m) => `<li>✕ ${escapeHtml(data.byId[m].name)}</li>`).join("");
  $("guess-form").hidden = game.over;
  $("result").hidden = !game.over;
  $("answers").hidden = !game.over;
  if (game.over) {
    const n = game.answers.length;
    const rank = game.got ? game.answers.indexOf(game.got) : -1;
    $("result").classList.toggle("lose", !game.got);
    tintResult(teamAbbr());
    $("result-kicker").textContent = game.got ? (rank === 0 ? "The obvious one" : rank >= n / 2 && n > 3 ? "Deep cut" : "Got it") : "Stumped";
    $("result-title").innerHTML = game.got ? playerLink(game.got, data.byId[game.got].name) : `${n} fit`;
    $("result-text").textContent = game.got
      ? `${n} player${n === 1 ? "" : "s"} fit. Yours was the ${rank + 1 === 1 ? "best-known" : `#${rank + 1} best-known`}. Streak: ${r.streak}. Best: ${r.best}.`
      : `Run over. Best streak: ${r.best}.`;
    $("next").textContent = game.got ? "Next pair" : "New run";
    $("share-msg").textContent = "";
    $("answers").innerHTML = `
      <span class="label">Everyone who fit · ${n}</span>
      <ol class="ag-answer-list">${game.answers.slice(0, 15).map((id) => `<li class="${id === game.got ? "mine" : ""}">${avatar(id, "xs")}${playerLink(id, data.byId[id].name)}</li>`).join("")}</ol>
      ${n > 15 ? `<p class="meta">…and ${n - 15} more.</p>` : ""}`;
  }
}

function renderSchool() {
  const r = record();
  const p = data.byId[game.player];
  $("streak").textContent = r.streak;
  $("best").textContent = r.best;
  $("school-left").textContent = GUESSES - game.misses.length;
  const state = $("state");
  state.className = "state";
  state.textContent = game.over ? (game.got != null ? "Got it" : "Stumped") : `${GUESSES - game.misses.length} left`;
  if (game.over) state.classList.add(game.got != null ? "win" : "lose");

  const teams = [...p.teams].map((t) => data.teams[t]);
  const clues = schoolClues();
  $("pair").innerHTML = `
    <div class="cc-player">
      ${avatar(game.player, "md")}
      <div class="cc-player-body">
        <b>${game.over ? playerLink(game.player, p.name) : escapeHtml(p.name)}</b>
        <span class="cc-player-teams">${teams.map((t) => `<span class="cp-badge" style="--team: ${teamColor(t)}">${t}</span>`).join("")}</span>
      </div>
    </div>
    <ol class="cc-clues">${clues.map((c, i) => {
      const open = game.over || i < game.misses.length;
      return `<li class="${open ? "open" : ""}"><span class="cp-clue-n">${i + 1}</span>${open ? c : "Locked: unlocks with a miss"}</li>`;
    }).join("")}</ol>`;
  $("school-misses").innerHTML = game.misses.map((c) => `<li>✕ ${escapeHtml(data.colleges[c])}</li>`).join("");

  $("result").hidden = !game.over;
  $("answers").hidden = !game.over;
  if (game.over) {
    const schools = schoolsOf(game.player);
    $("result").classList.toggle("lose", game.got == null);
    tintResult(teams[0]);
    $("result-kicker").textContent = game.got != null ? (game.misses.length ? `Got it in ${game.misses.length + 1}` : "First try") : "He went to";
    $("result-title").textContent = schools.map((c) => data.colleges[c]).join(" / ");
    $("result-text").textContent = (schools.length > 1 ? "He played at more than one school; any of them counted. " : "") +
      (game.got != null ? `Streak: ${r.streak}. Best: ${r.best}.` : `Run over. Best streak: ${r.best}.`);
    $("next").textContent = game.got != null ? "Next player" : "New run";
    $("share-msg").textContent = "";
    const main = schools[0];
    const alumni = Object.keys(data.byId).filter((id) => id !== game.player && data.byId[id].colleges.has(main))
      .sort((a, b) => data.byId[b].fame - data.byId[a].fame);
    $("answers").innerHTML = `
      <span class="label">Other ${escapeHtml(data.colleges[main])} players in the NBA · ${alumni.length}</span>
      <ol class="ag-answer-list">${alumni.slice(0, 12).map((id) => `<li>${avatar(id, "xs")}${playerLink(id, data.byId[id].name)}</li>`).join("")}</ol>
      ${alumni.length > 12 ? `<p class="meta">…and ${alumni.length - 12} more.</p>` : ""}`;
  }
}

// ---------- wiring ----------

$("guess-form").addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
$("give-up").addEventListener("click", () => !game.over && finish(null));
$("school-form").addEventListener("submit", (e) => { e.preventDefault(); submitSchool(); });
$("school-give-up").addEventListener("click", () => !game.over && finish(null));
$("next").addEventListener("click", () => { newRound(); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);
for (const btn of document.querySelectorAll(".cc-levels button")) {
  btn.addEventListener("click", () => setLevel(btn.dataset.level));
}
for (const btn of document.querySelectorAll(".cc-modes button")) {
  btn.addEventListener("click", () => btn.dataset.mode !== game.mode && setMode(btn.dataset.mode));
}

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    newRound();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
